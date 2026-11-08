import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Clock,
  Eye,
  PenLine,
  Redo2,
  Save,
  Undo2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/i18n/useI18n';
import { useAppStore } from '@/stores/app';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Markdown } from '@/components/Markdown';
import { AttachmentManager } from '@/features/attachments/AttachmentManager';
import { SchedulePicker } from './SchedulePicker';
import { COVER_THEMES, LETTER_KINDS, MOODS, getCover } from './themes';
import { useAutoSave, useUndoableText } from '@/hooks/useAutoSave';
import {
  draftLetter,
  insertLetter,
  sealLetter,
  saveDraftContent,
} from '@/services/storage/letters';
import type { Attachment, Letter, LetterKind, MoodSnapshot } from '@/types';
import { countWords } from '@/utils/misc';
import { formatDate, isValidFutureDate, offsetToDate, parseISO } from '@/utils/date';
import type { TranslationKey } from '@/i18n/dictionary';
import { cn } from '@/utils/misc';

type Tab = 'write' | 'preview';

export function ComposePage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const letters = useAppStore((s) => s.letters);
  const reloadLetters = useAppStore((s) => s.reloadLetters);

  const existing = useMemo(
    () => (id ? letters.find((l) => l.id === id) : undefined),
    [id, letters],
  );

  /* 回信模式：通过查询参数带入原信件信息 */
  const replyToParam = searchParams.get('replyTo') ?? undefined;

  const [letterId, setLetterId] = useState<string | null>(existing?.id ?? null);
  const [title, setTitle] = useState(existing?.title ?? searchParams.get('title') ?? '');
  const [recipient, setRecipient] = useState(
    existing?.recipient ?? searchParams.get('recipient') ?? '未来的我',
  );
  const [kind, setKind] = useState<LetterKind>(existing?.kind ?? 'future-self');
  const [cover, setCover] = useState(existing?.cover ?? 'night');
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [tagDraft, setTagDraft] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>(existing?.attachments ?? []);
  const [mood, setMood] = useState<MoodSnapshot>(existing?.mood ?? {});
  const [scheduleAt, setScheduleAt] = useState(
    existing?.scheduledOpenAt ?? offsetToDate('1y').toISOString(),
  );
  const [reminderDays, setReminderDays] = useState<number>(existing?.reminder?.daysBefore ?? 0);
  const [reminderEnabled, setReminderEnabled] = useState(existing?.reminder?.enabled ?? false);
  const [replyTo] = useState<string | undefined>(existing?.replyTo ?? replyToParam);
  const [tab, setTab] = useState<Tab>('write');
  const [confirmSeal, setConfirmSeal] = useState(false);
  const [sealing, setSealing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const editor = useUndoableText(existing?.content ?? '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isLocked = existing ? existing.status !== 'DRAFT' : false;

  /* 首次进入：若来自 URL 的 id 找不到，回到新建态 */
  useEffect(() => {
    if (id && !existing && letters.length > 0) {
      toast.error(t('letter.notFound'));
      navigate('/compose', { replace: true });
    }
  }, [id, existing, letters.length, navigate, t]);

  /* 若已存在草稿（无 id 参数且有未完成草稿），提示可恢复 */
  useEffect(() => {
    if (letterId || id) return;
    const draft = letters.find((l) => l.status === 'DRAFT');
    if (draft) toast.info(t('compose.draftExists'), { duration: 4000 });
    // 仅首次挂载检查一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snapshot = useMemo(
    () => ({
      title,
      recipient,
      content: editor.value,
      kind,
      cover,
      tags,
      attachments,
      mood,
      scheduledOpenAt: scheduleAt,
      reminder: { enabled: reminderEnabled, daysBefore: reminderDays },
    }),
    [
      title,
      recipient,
      editor.value,
      kind,
      cover,
      tags,
      attachments,
      mood,
      scheduleAt,
      reminderEnabled,
      reminderDays,
    ],
  );

  /** 自动保存：没有 id 时先创建草稿，之后每次更新 */
  const persist = useCallback(
    async (data: typeof snapshot) => {
      if (isLocked) return;
      try {
        setSaveError(null);
        if (!letterId) {
          const created = draftLetter({
            title: data.title || '',
            recipient: data.recipient,
            content: data.content,
            scheduledOpenAt: data.scheduledOpenAt,
            kind: data.kind,
            cover: data.cover,
            tags: data.tags,
            attachments: data.attachments,
            mood: data.mood,
            reminder: data.reminder,
            replyTo,
          });
          await insertLetter(created);
          setLetterId(created.id);
          window.history.replaceState(null, '', `#/compose/${created.id}`);
          await reloadLetters();
          return;
        }
        await saveDraftContent(letterId, {
          title: data.title,
          recipient: data.recipient,
          content: data.content,
          kind: data.kind,
          cover: data.cover,
          tags: data.tags,
          attachments: data.attachments,
          mood: data.mood,
          scheduledOpenAt: data.scheduledOpenAt,
          reminder: data.reminder,
        });
        await reloadLetters();
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : String(error));
        throw error;
      }
    },
    [letterId, isLocked, reloadLetters, replyTo],
  );

  const { state: saveState, lastSavedAt, flush } = useAutoSave(snapshot, persist, {
    enabled: !isLocked && (Boolean(letterId) || Object.keys(snapshot).length > 0),
    delay: 900,
  });

  useEffect(() => {
    if (saveState === 'error' && saveError) toast.error(`${t('compose.saveFailed')}: ${saveError}`);
  }, [saveState, saveError, t]);

  const wordCount = countWords(editor.value);
  const scheduleDate = parseISO(scheduleAt) ?? new Date();
  const dateValid = isValidFutureDate(scheduleDate);

  const ensureId = async (): Promise<string> => {
    if (letterId) return letterId;
    const created = draftLetter({
      title,
      recipient,
      content: editor.value,
      scheduledOpenAt: scheduleAt,
      kind,
      cover,
      tags,
      attachments,
      mood,
      reminder: { enabled: reminderEnabled, daysBefore: reminderDays },
      replyTo,
    });
    await insertLetter(created);
    setLetterId(created.id);
    window.history.replaceState(null, '', `#/compose/${created.id}`);
    await reloadLetters();
    return created.id;
  };

  const handleSaveDraft = async () => {
    try {
      await ensureId();
      await flush();
      await reloadLetters();
      toast.success(t('compose.draftSaved'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('compose.saveFailed'));
    }
  };

  const handleSeal = async () => {
    setSealing(true);
    try {
      if (!dateValid) {
        toast.error(t('compose.invalidDate'));
        return;
      }
      const finalId = await ensureId();
      await saveDraftContent(finalId, {
        title: title.trim() || (lang === 'zh' ? '未命名信件' : 'Untitled letter'),
        recipient,
        content: editor.value,
        kind,
        cover,
        tags,
        attachments,
        mood,
        scheduledOpenAt: scheduleAt,
        reminder: { enabled: reminderEnabled, daysBefore: reminderDays },
      });
      await sealLetter(finalId, scheduleAt);
      await reloadLetters();
      setConfirmSeal(false);
      toast.success(t('compose.sealed'));
      navigate(`/letter/${finalId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSealing(false);
    }
  };

  const sealDisabled = !dateValid || (!editor.value.trim() && attachments.length === 0);

  const addTag = () => {
    const value = tagDraft.trim().replace(/^#/, '');
    if (!value || tags.includes(value) || tags.length >= 8) {
      setTagDraft('');
      return;
    }
    setTags([...tags, value]);
    setTagDraft('');
  };

  return (
    <div className="container-page py-6 pb-24 sm:py-10">
      {/* 顶部栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/archive" className="btn btn-ghost h-9 w-9 !min-h-9 !px-0" aria-label={t('compose.backToArchive')}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl">
              {isLocked ? t('compose.title.edit') : letterId ? t('compose.title.edit') : t('compose.title.new')}
            </h1>
            {replyTo && (
              <p className="mt-0.5 text-xs text-muted">
                {t('compose.replyTo')} 「{letters.find((l) => l.id === replyTo)?.title ?? '—'}」
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[0.58rem] tracking-[0.1em] text-muted sm:text-[0.62rem]">
            {saveState === 'saving' && t('compose.saving')}
            {saveState === 'saved' && lastSavedAt && (
              <span className="inline-flex items-center gap-1">
                <Check className="h-3 w-3" />
                {t('compose.saved', {
                  time: lastSavedAt.toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                })}
              </span>
            )}
            {saveState === 'pending' && t('compose.unsaved')}
            {saveState === 'error' && (
              <span style={{ color: '#d06060' }}>{t('compose.saveFailed')}</span>
            )}
          </span>
        </div>
      </div>

      {isLocked && (
        <div
          className="mt-4 rounded-lg border p-3 text-xs leading-relaxed"
          style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--accent-soft)' }}
        >
          {t('compose.editingLocked')} · {t(`letter.status.${existing!.status}` as TranslationKey)}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
        {/* ───── 写作区 ───── */}
        <div className="min-w-0">
          <div className="surface rounded-xl">
            {/* 标签页 */}
            <div
              className="flex items-center justify-between border-b px-3 sm:px-4"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex">
                {(['write', 'preview'] as Tab[]).map((tb) => (
                  <button
                    key={tb}
                    type="button"
                    onClick={() => setTab(tb)}
                    className={cn(
                      'relative min-h-[46px] px-3 text-xs tracking-wide transition-colors sm:text-sm',
                      tab === tb ? 'text-[var(--text-primary)]' : 'text-muted',
                    )}
                  >
                    {tb === 'write' ? t('compose.content') : t('compose.preview')}
                    {tab === tb && (
                      <span
                        className="absolute inset-x-2 -bottom-px h-[2px]"
                        style={{ backgroundColor: 'var(--accent)' }}
                      />
                    )}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={editor.undo}
                  disabled={!editor.canUndo || isLocked}
                  className="btn btn-ghost h-9 w-9 !min-h-9 !px-0"
                  aria-label="Undo"
                  title="Undo"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={editor.redo}
                  disabled={!editor.canRedo || isLocked}
                  className="btn btn-ghost h-9 w-9 !min-h-9 !px-0"
                  aria-label="Redo"
                  title="Redo"
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6">
              {/* 收件人 + 标题 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="eyebrow shrink-0">{t('compose.writeTo')}</span>
                  <input
                    className="min-w-0 flex-1 border-0 bg-transparent pb-1 font-serif text-base outline-none focus:outline-none"
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      color: 'var(--accent)',
                    }}
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder={t('compose.recipientPlaceholder')}
                    disabled={isLocked}
                    maxLength={60}
                  />
                </div>

                <input
                  className="w-full border-0 bg-transparent py-1 font-serif text-2xl outline-none placeholder:text-[var(--text-muted)] focus:outline-none sm:text-3xl"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('compose.titlePlaceholder')}
                  disabled={isLocked}
                  maxLength={120}
                />
              </div>

              <div className="gold-rule my-4" />

              {tab === 'write' ? (
                <textarea
                  ref={textareaRef}
                  className="min-h-[46vh] w-full resize-y border-0 bg-transparent font-serif text-[1.02rem] leading-[1.95] outline-none placeholder:text-[var(--text-muted)] focus:outline-none sm:min-h-[52vh]"
                  value={editor.value}
                  onChange={(e) => editor.setValue(e.target.value)}
                  placeholder={t('compose.contentPlaceholder')}
                  disabled={isLocked}
                  spellCheck
                />
              ) : (
                <div className="min-h-[46vh] sm:min-h-[52vh]">
                  {editor.value.trim() ? (
                    <Markdown
                      text={editor.value}
                      className="font-serif text-[1.02rem] leading-[1.95]"
                    />
                  ) : (
                    <p className="text-sm text-muted">{t('common.empty')}</p>
                  )}
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3"
                style={{ borderColor: 'var(--border-subtle)' }}>
                <span className="font-mono text-[0.62rem] tracking-[0.1em] text-muted">
                  {t('compose.words', { n: wordCount })}
                </span>
                <div className="flex items-center gap-2">
                  {isLocked && (
                    <span className="font-mono text-[0.62rem] text-muted">{t('compose.editingLocked')}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setTab(tab === 'write' ? 'preview' : 'write')}
                    className="inline-flex items-center gap-1 text-[0.68rem] text-secondary hover:text-[var(--accent)]"
                  >
                    <Eye className="h-3 w-3" />
                    {tab === 'write' ? t('compose.preview') : t('compose.content')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-2 px-1 text-[0.65rem] leading-relaxed text-muted">
            {t('compose.markdownHint')}
          </p>

          {/* 桌面端操作按钮 */}
          <div className="mt-5 hidden items-center gap-2.5 sm:flex">
            <button type="button" className="btn btn-primary" onClick={() => setConfirmSeal(true)} disabled={sealDisabled || isLocked}>
              <Save className="h-4 w-4" />
              {t('compose.seal')}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => void handleSaveDraft()} disabled={isLocked}>
              {t('compose.saveDraft')}
            </button>
            <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[0.62rem] text-muted">
              <Clock className="h-3 w-3" />
              {formatDate(scheduleDate, lang, 'numeric')}
            </span>
          </div>
        </div>

        {/* ───── 侧边设定 ───── */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <section className="surface rounded-xl p-4">
            <h2 className="eyebrow">{t('compose.kind')}</h2>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {LETTER_KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  className="chip"
                  data-active={kind === k.id}
                  disabled={isLocked}
                  onClick={() => {
                    setKind(k.id as LetterKind);
                    if (k.recipient) setRecipient(k.recipient);
                  }}
                >
                  {lang === 'zh' ? k.zh : k.en}
                </button>
              ))}
            </div>
          </section>

          <section className="surface rounded-xl p-4">
            <h2 className="eyebrow">{t('compose.schedule')}</h2>
            <div className="mt-3">
              <SchedulePicker value={scheduleAt} onChange={setScheduleAt} disabled={isLocked} />
            </div>

            <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
              <h3 className="eyebrow">{t('compose.reminder')}</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  { on: false, days: 0, label: t('compose.reminderOff') },
                  { on: true, days: 0, label: t('compose.reminderOnDay') },
                  { on: true, days: 7, label: t('compose.reminder7') },
                  { on: true, days: 30, label: t('compose.reminder30') },
                ].map((opt) => (
                  <button
                    key={`${opt.on}-${opt.days}`}
                    type="button"
                    className="chip"
                    data-active={reminderEnabled === opt.on && reminderDays === opt.days}
                    disabled={isLocked}
                    onClick={() => {
                      setReminderEnabled(opt.on);
                      setReminderDays(opt.days);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {reminderEnabled && (
                <p className="mt-2 text-[0.65rem] leading-relaxed text-muted">
                  {t('compose.reminderNote')}
                </p>
              )}
            </div>
          </section>

          <section className="surface rounded-xl p-4">
            <h2 className="eyebrow">{t('compose.cover')}</h2>
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              {COVER_THEMES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCover(c.id)}
                  disabled={isLocked}
                  className="relative overflow-hidden rounded-md border transition-transform hover:scale-[1.02]"
                  style={{
                    aspectRatio: '1.5',
                    background: c.gradient,
                    borderColor: cover === c.id ? 'var(--accent)' : 'var(--border-subtle)',
                    borderWidth: cover === c.id ? 2 : 1,
                  }}
                  aria-label={lang === 'zh' ? c.nameZh : c.nameEn}
                  aria-pressed={cover === c.id}
                >
                  <span
                    className="absolute inset-x-1.5 bottom-1 truncate font-mono text-[0.5rem] tracking-wide"
                    style={{ color: c.accent }}
                  >
                    {lang === 'zh' ? c.nameZh : c.nameEn}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="surface rounded-xl p-4">
            <h2 className="eyebrow">{t('compose.tags')}</h2>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span key={tag} className="chip" data-active="true">
                  #{tag}
                  {!isLocked && (
                    <button
                      type="button"
                      onClick={() => setTags(tags.filter((x) => x !== tag))}
                      aria-label={t('attachment.remove')}
                      className="ml-0.5 opacity-60 hover:opacity-100"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {!isLocked && (
              <input
                className="field mt-2.5 text-sm"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder={t('compose.tagsHint')}
                maxLength={20}
              />
            )}
          </section>

          <section className="surface rounded-xl p-4">
            <h2 className="eyebrow">{t('compose.attachments')}</h2>
            <div className="mt-2.5">
              <AttachmentManager
                letterId={letterId ?? 'pending'}
                attachments={attachments}
                onChange={setAttachments}
                disabled={isLocked}
              />
            </div>
          </section>

          {/* 心情快照 */}
          <section className="surface rounded-xl p-4">
            <h2 className="eyebrow">{t('compose.mood')}</h2>
            <p className="mt-1.5 text-[0.65rem] leading-relaxed text-muted">{t('compose.moodHint')}</p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {MOODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="chip"
                  data-active={mood.mood === m.id}
                  disabled={isLocked}
                  onClick={() => setMood({ ...mood, mood: mood.mood === m.id ? undefined : (m.id as MoodSnapshot['mood']) })}
                  style={mood.mood === m.id ? { borderColor: m.color, color: m.color } : undefined}
                >
                  <span style={{ color: m.color }}>{m.glyph}</span>
                  {lang === 'zh' ? m.zh : m.en}
                </button>
              ))}
            </div>

            <div className="mt-3 space-y-2.5">
              {(
                [
                  ['mostImportant', t('compose.mood.mostImportant')],
                  ['workingOn', t('compose.mood.workingOn')],
                  ['biggestWorry', t('compose.mood.biggestWorry')],
                  ['lookingForwardTo', t('compose.mood.lookingForwardTo')],
                  ['hopeForFuture', t('compose.mood.hopeForFuture')],
                  ['city', t('compose.mood.city')],
                  ['currentGoal', t('compose.mood.currentGoal')],
                ] as Array<[keyof MoodSnapshot, string]>
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="mb-1 block text-[0.6rem] tracking-[0.08em] uppercase text-muted">
                    {label}
                  </label>
                  <input
                    className="field !min-h-[38px] text-sm"
                    value={(mood[key] as string) ?? ''}
                    onChange={(e) => setMood({ ...mood, [key]: e.target.value })}
                    disabled={isLocked}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* 手机端固定操作条 */}
          <div className="sm:hidden">
            <div
              className="fixed inset-x-0 bottom-[56px] z-30 border-t p-3 backdrop-blur-xl"
              style={{
                borderColor: 'var(--border-subtle)',
                backgroundColor: 'color-mix(in srgb, var(--bg-app) 92%, transparent)',
              }}
            >
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-primary flex-1"
                  onClick={() => setConfirmSeal(true)}
                  disabled={sealDisabled || isLocked}
                >
                  <PenLine className="h-4 w-4" />
                  {t('compose.seal')}
                </button>
                <button
                  type="button"
                  className="btn btn-outline shrink-0"
                  onClick={() => void handleSaveDraft()}
                  disabled={isLocked}
                >
                  {t('compose.saveDraft')}
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmSeal}
        title={t('compose.sealConfirmTitle')}
        body={t('compose.sealConfirmBody')}
        confirmLabel={sealing ? t('common.loading') : t('compose.sealConfirmOk')}
        onCancel={() => setConfirmSeal(false)}
        onConfirm={() => void handleSeal()}
      >
        <div
          className="rounded-lg border p-3 text-xs"
          style={{ borderColor: 'var(--border-subtle)', background: getCover(cover).gradient }}
        >
          <p className="font-mono text-[0.6rem] tracking-[0.18em] uppercase" style={{ color: getCover(cover).accent, opacity: 0.85 }}>
            TO: {(recipient || 'FUTURE ME').toUpperCase()}
          </p>
          <p className="mt-1.5 font-serif text-sm" style={{ color: getCover(cover).accent }}>
            {title || t('compose.titlePlaceholder')}
          </p>
          <p className="mt-2 font-mono text-[0.6rem] tabular-nums" style={{ color: getCover(cover).accent, opacity: 0.8 }}>
            OPEN: {formatDate(scheduleDate, lang, 'numeric')}
          </p>
        </div>
      </ConfirmDialog>
    </div>
  );
}

export type { Letter };
