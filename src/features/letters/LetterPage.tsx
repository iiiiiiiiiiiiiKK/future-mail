import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarClock,
  Clock,
  Copy,
  Download,
  FileDown,
  FileText,
  Link2,
  Lock,
  PackageOpen,
  Pencil,
  Repeat,
  Share2,
  Star,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app';
import { useI18n } from '@/i18n/useI18n';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Countdown } from '@/components/Countdown';
import { Envelope } from '@/components/Envelope';
import { Markdown } from '@/components/Markdown';
import { StatusBadge } from '@/components/StatusBadge';
import { AttachmentViewer } from '@/features/attachments/AttachmentViewer';
import { SchedulePicker } from '@/features/compose/SchedulePicker';
import { getCover, getMood } from '@/features/compose/themes';
import {
  cancelLetter,
  deleteLetter,
  earlyOpen,
  openLetter,
  updateLetter,
  reschedule,
} from '@/services/storage/letters';
import { downloadLetterMarkdown, downloadLetterPdf } from '@/services/export/export';
import { formatDate, calendarDaysBetween, parseISO } from '@/utils/date';
import { cn, copyText } from '@/utils/misc';
import { useNow } from '@/hooks/useNow';
import type { Capsule, Letter } from '@/types';

type DialogKind = 'open' | 'early' | 'delete' | 'cancel' | 'reschedule' | null;

export function LetterPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const letters = useAppStore((s) => s.letters);
  const letter = useMemo(() => letters.find((l) => l.id === id), [letters, id]);

  if (!letter) {
    return (
      <div className="container-page flex min-h-[60dvh] flex-col items-center justify-center py-16 text-center">
        <Lock className="h-8 w-8 text-muted" />
        <h1 className="mt-4 text-2xl">{t('letter.notFound')}</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">{t('letter.notFoundBody')}</p>
        <Link to="/archive" className="btn btn-outline mt-6">
          {t('archive.title')}
        </Link>
      </div>
    );
  }

  /* key 保证切换信件时内部状态（回顾笔记、改期值）重新初始化 */
  return <LetterDetail key={letter.id} letter={letter} />;
}

function LetterDetail({ letter }: { letter: Letter }) {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const letters = useAppStore((s) => s.letters);
  const reloadLetters = useAppStore((s) => s.reloadLetters);
  const setLastVisited = useAppStore((s) => s.setLastVisited);
  const now = useNow(15_000);

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [opening, setOpening] = useState(false);
  const [unsealed, setUnsealed] = useState(false);
  const [reviewNote, setReviewNote] = useState(letter.reviewNote ?? '');
  const [rescheduleAt, setRescheduleAt] = useState(letter.scheduledOpenAt);

  useEffect(() => {
    setLastVisited(letter.id);
  }, [letter.id, setLastVisited]);

  const capsule = letter as Letter & Partial<Capsule>;
  const isRevealed = unsealed || letter.status === 'OPENED';

  const spanDays = useMemo(() => {
    const created = parseISO(letter.createdAt);
    const opened = parseISO(letter.openedAt ?? '') ?? new Date();
    if (!created) return 0;
    return calendarDaysBetween(created, opened);
  }, [letter.createdAt, letter.openedAt]);

  const cover = getCover(letter.cover);
  const mood = getMood(letter.mood?.mood);
  const openAtMs = parseISO(letter.scheduledOpenAt)?.getTime() ?? Infinity;
  const canOpen = letter.status === 'READY' || (letter.status === 'SEALED' && openAtMs <= now);

  const doOpen = async () => {
    setOpening(true);
    try {
      await openLetter(letter.id);
      await reloadLetters();
      setUnsealed(true);
      setDialog(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setOpening(false);
    }
  };

  const doEarlyOpen = async () => {
    setOpening(true);
    try {
      await earlyOpen(letter.id);
      await reloadLetters();
      setUnsealed(true);
      setDialog(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setOpening(false);
    }
  };

  const doDelete = async () => {
    await deleteLetter(letter.id);
    await reloadLetters();
    setDialog(null);
    navigate('/archive');
  };

  const doCancel = async () => {
    try {
      await cancelLetter(letter.id);
      await reloadLetters();
      setDialog(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const doReschedule = async () => {
    try {
      await reschedule(letter.id, rescheduleAt);
      await reloadLetters();
      setDialog(null);
      toast.success(t('letter.rescheduled'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const toggleStar = async () => {
    await updateLetter(letter.id, { starred: !letter.starred });
    await reloadLetters();
  };

  const saveReviewNote = async () => {
    await updateLetter(letter.id, { reviewNote });
    await reloadLetters();
    toast.success(t('letter.reviewNoteSaved'));
  };

  const handleReply = () => {
    const params = new URLSearchParams({
      replyTo: letter.id,
      title: lang === 'zh' ? `回信：${letter.title || '—'}` : `Reply: ${letter.title || '—'}`,
      recipient: letter.recipient,
    });
    navigate(`/compose?${params.toString()}`);
  };

  return (
    <div className="container-page py-6 pb-20 sm:py-10">
      {/* 顶部导航 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link to="/archive" className="btn btn-ghost h-9 w-9 !min-h-9 !px-0" aria-label={t('common.back')}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <StatusBadge status={letter.status} />
          <span className="font-mono text-[0.62rem] tracking-[0.1em] text-muted">{letter.serial}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void toggleStar()}
            className="btn btn-ghost h-9 w-9 !min-h-9 !px-0"
            aria-label={letter.starred ? t('letter.unstar') : t('letter.star')}
            title={letter.starred ? t('letter.unstar') : t('letter.star')}
            style={letter.starred ? { color: 'var(--accent)' } : undefined}
          >
            <Star className={cn('h-4 w-4', letter.starred && 'fill-current')} />
          </button>
          {letter.status === 'DRAFT' && (
            <Link to={`/compose/${letter.id}`} className="btn btn-outline !min-h-9 text-xs">
              <Pencil className="h-3.5 w-3.5" />
              {t('letter.edit')}
            </Link>
          )}
          <button
            type="button"
            onClick={() => setDialog('delete')}
            className="btn btn-ghost h-9 w-9 !min-h-9 !px-0"
            aria-label={t('letter.delete')}
            title={t('letter.delete')}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 主区域 */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
        <article className="min-w-0">
          {!isRevealed ? (
            /* ───── 封存状态 ───── */
            <div className="surface overflow-hidden rounded-xl">
              <div className="px-5 pt-8 pb-6 sm:px-8 sm:pt-12">
                <p
                  className="font-mono text-[0.62rem] tracking-[0.24em] uppercase"
                  style={{ color: 'var(--accent)' }}
                >
                  {canOpen ? t('letter.fromPast') : t('letter.sealedNotice')}
                </p>
                {canOpen && <p className="mt-1.5 text-sm text-secondary">{t('letter.fromPastCn')}</p>}

                <div className="mt-8">
                  <Envelope
                    to={`TO: ${letter.recipient.toUpperCase().slice(0, 26)}`}
                    openDate={`OPEN DATE: ${formatDate(letter.scheduledOpenAt, 'en', 'numeric').replace(/\s/g, '')}`}
                    status={`STATUS: ${letter.status}`}
                    size="lg"
                  />
                </div>

                <div className="mx-auto mt-8 max-w-md text-center">
                  <h1 className="font-serif text-2xl leading-tight sm:text-3xl">
                    {letter.title || '—'}
                  </h1>
                  <p className="mt-2 text-xs leading-relaxed text-muted">{t('letter.lockedBody')}</p>

                  <div className="mt-5 flex justify-center">
                    <Countdown target={letter.scheduledOpenAt} onExpire={() => void reloadLetters()} />
                  </div>

                  <div className="mt-7 flex flex-col items-center gap-2.5 sm:flex-row sm:justify-center">
                    {canOpen ? (
                      <button
                        type="button"
                        className="btn btn-primary w-full sm:w-auto"
                        onClick={() => setDialog('open')}
                        disabled={opening}
                      >
                        <PackageOpen className="h-4 w-4" />
                        {opening ? t('letter.opening') : t('letter.open')}
                      </button>
                    ) : (
                      <p className="text-xs text-muted">
                        {t('letter.locked')} · {formatDate(letter.scheduledOpenAt, lang, 'numeric')}
                      </p>
                    )}
                    {letter.status === 'SEALED' && (
                      <button
                        type="button"
                        className="btn btn-outline w-full sm:w-auto"
                        onClick={() => setDialog('early')}
                      >
                        {t('letter.earlyOpen')}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div
                className="grid grid-cols-2 gap-px border-t sm:grid-cols-4"
                style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--border-subtle)' }}
              >
                {[
                  { label: t('letter.createdAt'), value: formatDate(letter.createdAt, lang, 'numeric') },
                  {
                    label: t('letter.sealedAt'),
                    value: letter.sealedAt ? formatDate(letter.sealedAt, lang, 'numeric') : '—',
                  },
                  { label: t('letter.openAt'), value: formatDate(letter.scheduledOpenAt, lang, 'numeric') },
                  { label: t('letter.serial'), value: letter.serial },
                ].map((row) => (
                  <div key={row.label} className="p-3.5" style={{ backgroundColor: 'var(--bg-panel)' }}>
                    <p className="font-mono text-[0.55rem] tracking-[0.14em] uppercase text-muted">
                      {row.label}
                    </p>
                    <p className="mt-1 font-mono text-[0.72rem] tabular-nums">{row.value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* ───── 已开启：正文 ───── */
            <div className="surface overflow-hidden rounded-xl">
              <div className="px-5 py-5 sm:px-8" style={{ background: cover.gradient }}>
                <p
                  className="font-mono text-[0.58rem] tracking-[0.22em] uppercase"
                  style={{ color: cover.accent, opacity: 0.9 }}
                >
                  {t('letter.serial')} {letter.serial}
                </p>
                <h1
                  className="mt-2 font-serif text-2xl leading-tight sm:text-3xl"
                  style={{ color: cover.accent }}
                >
                  {letter.title || '—'}
                </h1>
                <p
                  className="mt-2 font-mono text-[0.62rem] tracking-[0.12em]"
                  style={{ color: cover.accent, opacity: 0.8 }}
                >
                  TO: {letter.recipient}
                </p>
              </div>

              <div className="paper-grain px-5 py-7 sm:px-8 sm:py-10">
                <Markdown text={letter.content} className="font-serif text-[1.05rem] leading-[1.95]" />

                {capsule.isCapsule &&
                  Array.isArray(capsule.videoLinks) &&
                  capsule.videoLinks.length > 0 && (
                    <div className="mt-8 border-t pt-5" style={{ borderColor: 'var(--border-subtle)' }}>
                      <h2 className="eyebrow">{t('capsule.videoLinks')}</h2>
                      <ul className="mt-2 space-y-1.5">
                        {capsule.videoLinks.map((link) => (
                          <li key={link}>
                            <a
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-sm text-secondary underline-offset-2 hover:text-[var(--accent)] hover:underline"
                            >
                              <Link2 className="h-3.5 w-3.5" />
                              {link}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                {letter.attachments.length > 0 && (
                  <div className="mt-8 border-t pt-5" style={{ borderColor: 'var(--border-subtle)' }}>
                    <h2 className="eyebrow">
                      {t('letter.attachments')} · {letter.attachments.length}
                    </h2>
                    <div className="mt-3">
                      <AttachmentViewer attachments={letter.attachments} />
                    </div>
                  </div>
                )}

                {mood && (
                  <div className="mt-8 border-t pt-5" style={{ borderColor: 'var(--border-subtle)' }}>
                    <h2 className="eyebrow">{t('letter.mood')}</h2>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <span
                        className="chip"
                        data-active="true"
                        style={{ borderColor: mood.color, color: mood.color }}
                      >
                        <span>{mood.glyph}</span>
                        {lang === 'zh' ? mood.zh : mood.en}
                      </span>
                      {(
                        [
                          ['mostImportant', t('compose.mood.mostImportant')],
                          ['workingOn', t('compose.mood.workingOn')],
                          ['biggestWorry', t('compose.mood.biggestWorry')],
                          ['lookingForwardTo', t('compose.mood.lookingForwardTo')],
                          ['hopeForFuture', t('compose.mood.hopeForFuture')],
                          ['city', t('compose.mood.city')],
                          ['currentGoal', t('compose.mood.currentGoal')],
                        ] as const
                      ).map(([key, label]) => {
                        const value = letter.mood?.[key];
                        if (!value) return null;
                        return (
                          <span
                            key={key}
                            className="rounded-md border px-2 py-1 text-[0.68rem] text-secondary"
                            style={{ borderColor: 'var(--border-subtle)' }}
                          >
                            <span className="text-muted">{label}: </span>
                            {value}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div
                  className="mt-8 rounded-lg border p-4"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <p className="font-mono text-[0.62rem] tracking-[0.1em] text-muted">
                    {t('letter.span')}
                  </p>
                  <p className="mt-1.5 font-serif text-lg" style={{ color: 'var(--accent)' }}>
                    {t('letter.spanDays', { n: spanDays })}
                  </p>
                </div>
              </div>

              {/* 元信息条 */}
              <div
                className="grid grid-cols-2 gap-px border-t sm:grid-cols-4"
                style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--border-subtle)' }}
              >
                {[
                  { label: t('letter.createdAt'), value: formatDate(letter.createdAt, lang, 'numeric') },
                  { label: t('letter.openAt'), value: formatDate(letter.scheduledOpenAt, lang, 'numeric') },
                  {
                    label: t('letter.openedAt'),
                    value: letter.openedAt ? formatDate(letter.openedAt, lang, 'numeric') : '—',
                  },
                  { label: t('letter.span'), value: `${spanDays} d` },
                ].map((row) => (
                  <div key={row.label} className="p-3.5" style={{ backgroundColor: 'var(--bg-panel)' }}>
                    <p className="font-mono text-[0.55rem] tracking-[0.14em] uppercase text-muted">
                      {row.label}
                    </p>
                    <p className="mt-1 font-mono text-[0.72rem] tabular-nums">{row.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 回信 / 回顾笔记 */}
          {isRevealed && (
            <>
              <section className="surface mt-4 rounded-xl p-4 sm:p-5">
                <h2 className="eyebrow">{t('letter.reviewNote')}</h2>
                <p className="mt-1 text-[0.68rem] text-muted">{t('letter.reviewNotePlaceholder')}</p>
                <textarea
                  className="field mt-2.5 min-h-[90px] resize-y font-serif leading-relaxed"
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                />
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-outline !min-h-9 text-xs"
                    onClick={() => void saveReviewNote()}
                  >
                    {t('common.save')}
                  </button>
                  <button type="button" className="btn btn-primary !min-h-9 text-xs" onClick={handleReply}>
                    <Repeat className="h-3.5 w-3.5" />
                    {t('letter.reply')}
                  </button>
                </div>
                <p className="mt-2 text-[0.65rem] leading-relaxed text-muted">{t('letter.replyHint')}</p>
              </section>

              {letter.replies.length > 0 && (
                <section className="surface mt-4 rounded-xl p-4 sm:p-5">
                  <h2 className="eyebrow">
                    {t('letter.replies')} · {letter.replies.length}
                  </h2>
                  <ul className="mt-2.5 space-y-2">
                    {letter.replies.map((replyId) => {
                      const reply = letters.find((l) => l.id === replyId);
                      if (!reply) return null;
                      return (
                        <li key={replyId}>
                          <Link
                            to={`/letter/${reply.id}`}
                            className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm transition-colors hover:border-[var(--accent)]"
                            style={{ borderColor: 'var(--border-subtle)' }}
                          >
                            <span className="min-w-0 truncate">{reply.title || '—'}</span>
                            <StatusBadge status={reply.status} size="sm" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </>
          )}

          {letter.replyTo && (
            <Link
              to={`/letter/${letter.replyTo}`}
              className="mt-4 flex items-center gap-2 text-xs text-secondary hover:text-[var(--accent)]"
            >
              <ArrowLeft className="h-3 w-3" />
              {t('letter.viewOriginal')} · {letters.find((l) => l.id === letter.replyTo)?.title ?? '—'}
            </Link>
          )}
        </article>

        {/* ───── 侧栏 ───── */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className="surface rounded-xl p-4">
            <h2 className="eyebrow">{t('letter.serial')}</h2>
            <p className="mt-1.5 font-mono text-sm tracking-[0.06em]">{letter.serial}</p>

            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{t('letter.createdAt')}</dt>
                <dd className="tabular-nums">{formatDate(letter.createdAt, lang, 'numeric')}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{t('letter.openAt')}</dt>
                <dd className="tabular-nums" style={{ color: 'var(--accent)' }}>
                  {formatDate(letter.scheduledOpenAt, lang, 'numeric')}
                </dd>
              </div>
              {letter.sealedAt && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">{t('letter.sealedAt')}</dt>
                  <dd className="tabular-nums">{formatDate(letter.sealedAt, lang, 'numeric')}</dd>
                </div>
              )}
              {letter.openedAt && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">{t('letter.openedAt')}</dt>
                  <dd className="tabular-nums">{formatDate(letter.openedAt, lang, 'numeric')}</dd>
                </div>
              )}
            </dl>

            {letter.status === 'SEALED' && (
              <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
                <p className="font-mono text-[0.55rem] tracking-[0.14em] uppercase text-muted">
                  {t('letter.remaining')}
                </p>
                <div className="mt-2">
                  <Countdown target={letter.scheduledOpenAt} compact />
                </div>
              </div>
            )}
          </section>

          {letter.tags.length > 0 && (
            <section className="surface rounded-xl p-4">
              <h2 className="eyebrow">{t('letter.tags')}</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {letter.tags.map((tag) => (
                  <span key={tag} className="chip">
                    #{tag}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="surface rounded-xl p-4">
            <h2 className="eyebrow">{t('common.more')}</h2>
            <div className="mt-2.5 space-y-1">
              {isRevealed && (
                <>
                  <Link
                    to={`/letter/${letter.id}/share`}
                    className="flex min-h-[40px] items-center gap-2 rounded-md px-2 text-sm text-secondary transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    {t('letter.share')}
                  </Link>
                  <button
                    type="button"
                    onClick={() => downloadLetterMarkdown(letter, lang)}
                    className="flex min-h-[40px] w-full items-center gap-2 rounded-md px-2 text-sm text-secondary transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    {t('letter.exportMd')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void downloadLetterPdf(letter, lang)
                        .then(() => toast.success(t('letter.exported')))
                        .catch(() => toast.error(t('share.failed')));
                    }}
                    className="flex min-h-[40px] w-full items-center gap-2 rounded-md px-2 text-sm text-secondary transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {t('letter.exportPdf')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void copyText(letter.content).then((ok) =>
                        ok ? toast.success(t('letter.copied')) : toast.error(t('common.error')),
                      );
                    }}
                    className="flex min-h-[40px] w-full items-center gap-2 rounded-md px-2 text-sm text-secondary transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {t('letter.copyText')}
                  </button>
                </>
              )}
              {letter.status === 'SEALED' && (
                <>
                  <button
                    type="button"
                    onClick={() => setDialog('reschedule')}
                    className="flex min-h-[40px] w-full items-center gap-2 rounded-md px-2 text-sm text-secondary transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    {t('letter.reschedule')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDialog('cancel')}
                    className="flex min-h-[40px] w-full items-center gap-2 rounded-md px-2 text-sm text-secondary transition-colors hover:bg-[rgba(190,70,70,0.12)] hover:text-[#d06060]"
                  >
                    <Download className="h-3.5 w-3.5 rotate-180" />
                    {t('letter.cancelSeal')}
                  </button>
                </>
              )}
              {(letter.status === 'SEALED' || letter.status === 'READY') && (
                <button
                  type="button"
                  onClick={() => setDialog('early')}
                  className="flex min-h-[40px] w-full items-center gap-2 rounded-md px-2 text-sm text-secondary transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]"
                >
                  <Clock className="h-3.5 w-3.5" />
                  {t('letter.earlyOpen')}
                </button>
              )}
            </div>
          </section>
        </aside>
      </div>

      {/* ───── 对话框 ───── */}
      <ConfirmDialog
        open={dialog === 'open'}
        title={t('letter.open')}
        body={t('letter.openConfirm')}
        confirmLabel={opening ? t('letter.opening') : t('letter.open')}
        onCancel={() => setDialog(null)}
        onConfirm={() => void doOpen()}
      />

      <ConfirmDialog
        open={dialog === 'early'}
        title={t('letter.earlyOpen')}
        body={t('letter.earlyOpenWarn')}
        danger
        confirmLabel={t('letter.earlyOpenOk')}
        onCancel={() => setDialog(null)}
        onConfirm={() => void doEarlyOpen()}
      />

      <ConfirmDialog
        open={dialog === 'delete'}
        title={t('letter.deleteConfirmTitle')}
        body={t('letter.deleteConfirmBody')}
        danger
        confirmLabel={t('common.delete')}
        onCancel={() => setDialog(null)}
        onConfirm={() => void doDelete()}
      />

      <ConfirmDialog
        open={dialog === 'cancel'}
        title={t('letter.cancelSeal')}
        body={t('letter.cancelConfirmBody')}
        danger
        confirmLabel={t('common.confirm')}
        onCancel={() => setDialog(null)}
        onConfirm={() => void doCancel()}
      />

      <ConfirmDialog
        open={dialog === 'reschedule'}
        title={t('letter.reschedule')}
        confirmLabel={t('common.save')}
        onCancel={() => setDialog(null)}
        onConfirm={() => void doReschedule()}
      >
        <SchedulePicker value={rescheduleAt} onChange={setRescheduleAt} />
      </ConfirmDialog>
    </div>
  );
}
