import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, PackageOpen, PenLine, Shuffle, Sparkles } from 'lucide-react';
import { useAppStore } from '@/stores/app';
import { useI18n } from '@/i18n/useI18n';
import { Envelope } from '@/components/Envelope';
import { StatusBadge } from '@/components/StatusBadge';
import { Countdown } from '@/components/Countdown';
import { AuthorXLink } from '@/components/AuthorXLink';
import { formatDate, humanizeRemaining, parseISO } from '@/utils/date';
import { excerpt } from '@/utils/misc';

export function HomePage() {
  const letters = useAppStore((s) => s.letters);
  const { t, lang } = useI18n();
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const sealed = letters.filter((l) => l.status === 'SEALED');
    const opened = letters.filter((l) => l.status === 'OPENED');
    const ready = letters.filter((l) => l.status === 'READY');
    const longest = letters
      .filter((l) => l.status === 'SEALED' || l.status === 'READY' || l.status === 'OPENED')
      .map((l) => {
        const c = parseISO(l.createdAt);
        const o = parseISO(l.scheduledOpenAt);
        return c && o ? Math.max(0, Math.round((o.getTime() - c.getTime()) / 86_400_000)) : 0;
      })
      .sort((a, b) => b - a)[0];
    return { sealed: sealed.length, opened: opened.length, ready: ready.length, longest: longest ?? 0 };
  }, [letters]);

  /* 首页展示的信封：优先展示最近封存的一封，否则展示占位信封 */
  const featured = useMemo(() => {
    const candidates = letters.filter(
      (l) => l.status === 'SEALED' || l.status === 'READY' || l.status === 'DRAFT',
    );
    return (
      candidates.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )[0] ?? null
    );
  }, [letters]);

  const envelopeOpenDate = featured
    ? formatDate(featured.scheduledOpenAt, lang, 'numeric').replace(/\s/g, '')
    : formatDate(new Date(new Date().setFullYear(new Date().getFullYear() + 5)), lang, 'numeric').replace(/\s/g, '');

  const openRandomMemory = () => {
    const opened = letters.filter((l) => l.status === 'OPENED');
    if (opened.length === 0) {
      navigate('/archive');
      return;
    }
    const pick = opened[Math.floor(Math.random() * opened.length)];
    navigate(`/letter/${pick.id}`);
  };

  return (
    <div className="relative">
      {/* ───────── Hero ───────── */}
      <section className="container-page relative pt-10 pb-14 sm:pt-16 sm:pb-20">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] lg:gap-16">
          <div className="animate-fade-up">
            <div className="flex flex-wrap items-center gap-3">
              <span className="eyebrow">{t('brand.cn')} · EST. 2026</span>
              <span className="hidden h-3 w-px sm:block" style={{ backgroundColor: 'var(--border-strong)' }} />
              <span className="sm:hidden">
                <AuthorXLink variant="badge" />
              </span>
            </div>

            <h1 className="mt-5 font-serif text-[2.6rem] leading-[1.02] tracking-[-0.02em] sm:text-6xl lg:text-[4.4rem]">
              Future
              <br />
              <span style={{ color: 'var(--accent)' }}>Mail</span>
            </h1>

            <p className="mt-5 max-w-md font-mono text-[0.68rem] tracking-[0.26em] uppercase text-secondary sm:text-[0.75rem]">
              {t('brand.tagline')}
            </p>

            <div className="mt-4 max-w-md space-y-0.5">
              <p className="font-serif text-lg text-secondary sm:text-xl">{t('brand.sub')}</p>
              <p className="font-serif text-lg text-secondary sm:text-xl">{t('brand.subCn')}</p>
            </div>

            <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <Link to="/compose" className="btn btn-primary w-full sm:w-auto">
                <PenLine className="h-4 w-4" />
                {t('home.write')}
              </Link>
              <Link to="/capsule" className="btn btn-outline w-full sm:w-auto">
                <PackageOpen className="h-4 w-4" />
                {t('home.capsule')}
              </Link>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link
                to="/timeline"
                className="inline-flex items-center gap-1.5 text-xs text-secondary transition-colors hover:text-[var(--accent)]"
              >
                {t('home.timeline')}
                <ArrowRight className="h-3 w-3" />
              </Link>
              <button
                type="button"
                onClick={openRandomMemory}
                className="inline-flex items-center gap-1.5 text-xs text-secondary transition-colors hover:text-[var(--accent)]"
              >
                <Shuffle className="h-3 w-3" />
                {t('home.randomMemory')}
              </button>
            </div>

            <p className="mt-7 flex items-start gap-2 text-[0.7rem] leading-relaxed text-muted">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
              {t('home.privacyNote')}
            </p>
          </div>

          {/* 信封视觉 */}
          <div className="relative animate-float">
            <div
              className="pointer-events-none absolute -inset-8 -z-10 rounded-full opacity-60 blur-3xl"
              style={{
                background:
                  'radial-gradient(circle at 50% 50%, rgba(212,177,104,0.22), transparent 68%)',
              }}
            />
            <Envelope
              to={`TO: ${(featured?.recipient || 'FUTURE ME').toUpperCase().slice(0, 26)}`}
              openDate={`OPEN DATE: ${envelopeOpenDate}`}
              status={`STATUS: ${featured?.status === 'READY' ? 'READY' : 'SEALED'}`}
              size="lg"
            />
            <div className="mx-auto mt-5 max-w-[460px] px-1">
              <div className="tick-rule opacity-40" />
              {featured ? (
                <p className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[0.7rem] text-muted">
                  <span className="truncate">
                    {t('home.featured')} · {featured.title || '—'}
                  </span>
                  <span className="font-mono tabular-nums">
                    {humanizeRemaining(
                      parseISO(featured.scheduledOpenAt) ?? new Date(),
                      new Date(),
                      lang,
                    )}
                  </span>
                </p>
              ) : (
                <p className="mt-2.5 text-[0.7rem] text-muted">{t('home.noLetters')}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ───────── 到期提醒 ───────── */}
      {stats.ready > 0 && (
        <section className="container-page pb-8">
          <Link
            to="/archive?tab=ready"
            className="group flex items-center gap-4 rounded-xl border p-4 transition-colors sm:p-5"
            style={{
              borderColor: 'var(--accent)',
              backgroundColor: 'var(--accent-soft)',
            }}
          >
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: 'var(--accent)', color: '#191308' }}
            >
              <PackageOpen className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[0.62rem] tracking-[0.2em] uppercase" style={{ color: 'var(--accent)' }}>
                {t('home.readyBanner')}
              </p>
              <p className="mt-1 text-sm text-secondary">{t('home.readySub')}</p>
            </div>
            <span className="shrink-0 font-mono text-xs tabular-nums text-secondary sm:text-sm">
              {t('home.readyCount', { n: stats.ready })}
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-secondary transition-transform group-hover:translate-x-0.5" />
          </Link>
        </section>
      )}

      {/* ───────── 统计 ───────── */}
      <section className="container-page pb-14 sm:pb-20">
        <div
          className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border sm:grid-cols-4"
          style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--border-subtle)' }}
        >
          {[
            { label: t('home.stats.letters'), value: letters.length },
            { label: t('home.stats.sealed'), value: stats.sealed },
            { label: t('home.stats.opened'), value: stats.opened },
            { label: t('home.stats.days'), value: stats.longest },
          ].map((s) => (
            <div
              key={s.label}
              className="flex flex-col justify-between p-4 sm:p-5"
              style={{ backgroundColor: 'var(--bg-panel)' }}
            >
              <span className="font-mono text-[0.58rem] tracking-[0.16em] uppercase text-muted">
                {s.label}
              </span>
              <span className="mt-3 font-serif text-2xl tabular-nums sm:text-3xl">{s.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ───────── 最近信件 ───────── */}
      {letters.length > 0 && (
        <section className="container-page pb-20">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-xl sm:text-2xl">
              {lang === 'zh' ? '最近的信' : 'Recent letters'}
            </h2>
            <Link
              to="/archive"
              className="inline-flex items-center gap-1 text-xs text-secondary hover:text-[var(--accent)]"
            >
              {t('archive.title')}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {letters
              .slice()
              .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
              .slice(0, 6)
              .map((letter) => (
                <li key={letter.id}>
                  <Link
                    to={letter.status === 'DRAFT' ? `/compose/${letter.id}` : `/letter/${letter.id}`}
                    className="surface group flex h-full flex-col rounded-xl p-4 transition-all hover:-translate-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge status={letter.status} size="sm" />
                      <span className="font-mono text-[0.58rem] tracking-[0.1em] text-muted">
                        {letter.serial}
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-2 font-serif text-base leading-snug">
                      {letter.title || '—'}
                    </p>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">
                      {letter.status === 'SEALED' || letter.status === 'READY'
                        ? t('letter.sealedNotice')
                        : excerpt(letter.content, 70) || '—'}
                    </p>
                    <div className="mt-auto pt-4">
                      {letter.status === 'SEALED' || letter.status === 'READY' ? (
                        <Countdown target={letter.scheduledOpenAt} compact />
                      ) : (
                        <span className="font-mono text-[0.62rem] text-muted">
                          {formatDate(letter.createdAt, lang, 'numeric')}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
