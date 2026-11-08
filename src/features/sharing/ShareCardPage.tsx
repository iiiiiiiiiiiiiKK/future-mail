import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Download, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app';
import { useI18n } from '@/i18n/useI18n';
import { renderShareCard } from './renderCard';
import { getCover } from '@/features/compose/themes';
import { updateLetter } from '@/services/storage/letters';
import { formatDate, parseISO } from '@/utils/date';
import { copyText, downloadBlob } from '@/utils/misc';
import { calendarDaysBetween } from '@/utils/date';

export function ShareCardPage() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useI18n();
  const letters = useAppStore((s) => s.letters);
  const reloadLetters = useAppStore((s) => s.reloadLetters);

  const letter = useMemo(() => letters.find((l) => l.id === id), [letters, id]);
  const [quote, setQuote] = useState(letter?.shareQuote ?? '');
  const [rendered, setRendered] = useState<{ blob: Blob; url: string } | null>(null);
  const busy = rendered === null;

  /* 生成预览（防抖）。busy 与 URL 都在异步回调里更新，避免同步 effect 置状态 */
  useEffect(() => {
    if (!letter) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void renderShareCard({ letter, quote, lang })
        .then((b) => {
          if (cancelled) return;
          const url = URL.createObjectURL(b);
          setRendered({ blob: b, url });
        })
        .catch(() => toast.error(t('share.failed')));
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [letter, quote, lang, t]);

  useEffect(
    () => () => {
      if (rendered) URL.revokeObjectURL(rendered.url);
    },
    [rendered],
  );

  if (!letter) {
    return (
      <div className="container-page py-20 text-center">
        <p className="text-sm text-muted">{t('letter.notFound')}</p>
        <Link to="/archive" className="btn btn-outline mt-5">
          {t('archive.title')}
        </Link>
      </div>
    );
  }

  const created = parseISO(letter.createdAt);
  const opened = parseISO(letter.openedAt ?? '') ?? new Date();
  const span = created ? calendarDaysBetween(created, opened) : 0;
  const cover = getCover(letter.cover);

  const download = async () => {
    if (!rendered) return;
    await updateLetter(letter.id, { shareQuote: quote, privacy: quote.trim() ? 'shareable' : 'private' });
    await reloadLetters();
    downloadBlob(rendered.blob, `future-mail-card-${letter.serial}.png`);
    toast.success(t('share.generated'));
  };

  const copyCaption = async () => {
    const caption =
      lang === 'zh'
        ? `我在 ${created?.getFullYear() ?? ''} 年写下一封信，今天打开。\n相隔 ${span} 天。\n${quote.trim() ? `「${quote.trim()}」\n` : ''}#FutureMail #写给未来`
        : `I wrote a letter in ${created?.getFullYear() ?? ''} and opened it today.\n${span} days apart.\n${quote.trim() ? `“${quote.trim()}”\n` : ''}#FutureMail`;
    const ok = await copyText(caption);
    if (ok) toast.success(t('share.copied'));
    else toast.error(t('common.error'));
  };

  return (
    <div className="container-page py-6 pb-20 sm:py-10">
      <div className="flex items-center gap-2">
        <Link to={`/letter/${letter.id}`} className="btn btn-ghost h-9 w-9 !min-h-9 !px-0" aria-label={t('common.back')}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl sm:text-2xl">{t('share.title')}</h1>
          <p className="mt-0.5 text-xs text-muted">{t('share.sub')}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
        {/* 预览 */}
        <div className="min-w-0">
          <div
            className="relative mx-auto w-full overflow-hidden rounded-xl border"
            style={{ maxWidth: 420, aspectRatio: '1080 / 1350', borderColor: 'var(--border-subtle)', background: cover.gradient }}
          >
            {rendered ? (
              <img src={rendered.url} alt={t('share.preview')} className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <span className="eyebrow animate-pulse">{t('share.generating')}</span>
              </div>
            )}
          </div>
          <p className="mt-3 text-center text-[0.65rem] leading-relaxed text-muted">{t('share.notice')}</p>
        </div>

        {/* 控制 */}
        <aside className="space-y-4">
          <section className="surface rounded-xl p-4">
            <h2 className="eyebrow">{t('share.quote')}</h2>
            <p className="mt-1 text-[0.68rem] leading-relaxed text-muted">{t('share.quoteHint')}</p>
            <textarea
              className="field mt-2.5 min-h-[110px] resize-y font-serif leading-relaxed"
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              maxLength={140}
              placeholder={t('share.quoteEmpty')}
            />
            <p className="mt-1 text-right font-mono text-[0.58rem] text-muted">{quote.length}/140</p>
          </section>

          <section className="surface rounded-xl p-4">
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted">{t('letter.createdAt')}</dt>
                <dd className="tabular-nums">{formatDate(letter.createdAt, lang, 'numeric')}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">{t('letter.openedAt')}</dt>
                <dd className="tabular-nums">
                  {letter.openedAt ? formatDate(letter.openedAt, lang, 'numeric') : '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">{t('letter.span')}</dt>
                <dd className="tabular-nums">{span} d</dd>
              </div>
            </dl>
          </section>

          <div className="space-y-2">
            <button type="button" className="btn btn-primary w-full" onClick={() => void download()} disabled={!rendered}>
              <Download className="h-4 w-4" />
              {busy ? t('share.generating') : t('share.download')}
            </button>
            <button type="button" className="btn btn-outline w-full" onClick={() => void copyCaption()}>
              <Copy className="h-4 w-4" />
              {t('share.copyText')}
            </button>
          </div>

          <p className="flex items-start gap-2 text-[0.65rem] leading-relaxed text-muted">
            <Share2 className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              {t('brand.by')}{' '}
              <a
                href="https://x.com/0xkillcoin"
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 hover:underline"
              >
                @0xkillcoin
              </a>
            </span>
          </p>
        </aside>
      </div>
    </div>
  );
}
