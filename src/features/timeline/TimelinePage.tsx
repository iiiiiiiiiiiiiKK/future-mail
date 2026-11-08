import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, List, PenLine, Waypoints } from 'lucide-react';
import { useAppStore } from '@/stores/app';
import { useI18n } from '@/i18n/useI18n';
import { StatusBadge } from '@/components/StatusBadge';
import { Countdown } from '@/components/Countdown';
import { formatDate, parseISO } from '@/utils/date';
import { cn, excerpt } from '@/utils/misc';
import type { Letter } from '@/types';
import { useNow } from '@/hooks/useNow';

type View = 'timeline' | 'calendar' | 'list';

/** 时间轴事件：创建 / 开启 */
interface TimelineEvent {
  id: string;
  kind: 'created' | 'opens';
  at: Date;
  letter: Letter;
}

export function TimelinePage() {
  const letters = useAppStore((s) => s.letters);
  const { t, lang } = useI18n();
  const [view, setView] = useState<View>('timeline');
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const events = useMemo<TimelineEvent[]>(() => {
    const list: TimelineEvent[] = [];
    for (const letter of letters) {
      if (letter.status === 'CANCELLED') continue;
      const created = parseISO(letter.createdAt);
      const opens = parseISO(letter.scheduledOpenAt);
      if (created) list.push({ id: `${letter.id}-c`, kind: 'created', at: created, letter });
      if (opens && letter.status !== 'DRAFT')
        list.push({ id: `${letter.id}-o`, kind: 'opens', at: opens, letter });
    }
    return list.sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [letters]);

  const now = useNow(60_000);
  const upcoming = events.filter((e) => e.at.getTime() >= now).slice(0, 40);
  const past = events.filter((e) => e.at.getTime() < now).reverse().slice(0, 40);

  /* 日历：统计每个日期的事件 */
  const monthDays = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const first = new Date(year, month, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ date: Date | null; events: TimelineEvent[] }> = [];

    for (let i = 0; i < startWeekday; i += 1) cells.push({ date: null, events: [] });
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const dayEvents = events.filter((e) => {
        const d = e.at;
        return (
          d.getFullYear() === year && d.getMonth() === month && d.getDate() === day
        );
      });
      cells.push({ date, events: dayEvents });
    }
    return cells;
  }, [monthCursor, events]);

  const shiftMonth = (delta: number) => {
    setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const weekdayLabels =
    lang === 'zh'
      ? ['日', '一', '二', '三', '四', '五', '六']
      : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  if (letters.length === 0) {
    return (
      <div className="container-page flex min-h-[60dvh] flex-col items-center justify-center py-16 text-center">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
        >
          <Waypoints className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-2xl">{t('timeline.title')}</h1>
        <p className="mt-2 text-sm text-muted">{t('timeline.empty')}</p>
        <Link to="/compose" className="btn btn-primary mt-6">
          <PenLine className="h-4 w-4" />
          {t('timeline.emptyCta')}
        </Link>
      </div>
    );
  }

  return (
    <div className="container-page py-8 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="eyebrow">{t('nav.timeline')}</span>
          <h1 className="mt-2 text-3xl sm:text-4xl">{t('timeline.title')}</h1>
          <p className="mt-1.5 text-sm text-secondary">{t('timeline.sub')}</p>
        </div>

        <div
          className="flex rounded-lg border p-0.5"
          style={{ borderColor: 'var(--border-subtle)' }}
          role="tablist"
        >
          {(
            [
              ['timeline', t('timeline.view.timeline'), Waypoints],
              ['calendar', t('timeline.view.calendar'), CalendarDays],
              ['list', t('timeline.view.list'), List],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={cn(
                'inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors',
                view === id ? 'text-[var(--text-primary)]' : 'text-muted',
              )}
              style={{ backgroundColor: view === id ? 'var(--accent-soft)' : 'transparent' }}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ───── 时间轴 ───── */}
      {view === 'timeline' && (
        <div className="mt-8">
          <Section title={t('timeline.upcoming')} events={upcoming} nowMarker />
          {past.length > 0 && (
            <div className="mt-10">
              <Section title={t('timeline.past')} events={past} />
            </div>
          )}
        </div>
      )}

      {/* ───── 日历 ───── */}
      {view === 'calendar' && (
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="btn btn-ghost h-9 w-9 !min-h-9 !px-0"
              onClick={() => shiftMonth(-1)}
              aria-label={t('timeline.monthPrev')}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="font-serif text-lg tabular-nums">
              {monthCursor.getFullYear()}.{String(monthCursor.getMonth() + 1).padStart(2, '0')}
            </p>
            <button
              type="button"
              className="btn btn-ghost h-9 w-9 !min-h-9 !px-0"
              onClick={() => shiftMonth(1)}
              aria-label={t('timeline.monthNext')}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-1">
            {weekdayLabels.map((w) => (
              <div
                key={w}
                className="pb-2 text-center font-mono text-[0.58rem] tracking-[0.1em] text-muted"
              >
                {w}
              </div>
            ))}
            {monthDays.map((cell, idx) => {
              if (!cell.date) return <div key={`empty-${idx}`} />;
              const isToday =
                cell.date.toDateString() === new Date().toDateString();
              const hasLetter = cell.events.length > 0;
              return (
                <div
                  key={cell.date.toISOString()}
                  className="relative flex aspect-square flex-col items-center justify-center rounded-md border text-xs"
                  style={{
                    borderColor: isToday ? 'var(--accent)' : 'var(--border-subtle)',
                    backgroundColor: hasLetter ? 'var(--accent-soft)' : 'transparent',
                  }}
                  title={
                    hasLetter
                      ? cell.events.map((e) => `${e.letter.title || '—'} (${e.kind})`).join('\n')
                      : undefined
                  }
                >
                  <span className={cn('tabular-nums', isToday && 'font-semibold')}>
                    {cell.date.getDate()}
                  </span>
                  {hasLetter && (
                    <span className="mt-0.5 flex gap-0.5">
                      {cell.events.slice(0, 3).map((e) => (
                        <span
                          key={e.id}
                          className="h-1 w-1 rounded-full"
                          style={{
                            backgroundColor:
                              e.kind === 'opens' ? 'var(--accent)' : 'var(--text-muted)',
                          }}
                        />
                      ))}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-[0.68rem] text-muted">{t('timeline.calendarHint')}</p>
        </div>
      )}

      {/* ───── 列表 ───── */}
      {view === 'list' && (
        <ul className="mt-8 divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {letters
            .slice()
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map((letter) => (
              <li key={letter.id}>
                <Link
                  to={letter.status === 'DRAFT' ? `/compose/${letter.id}` : `/letter/${letter.id}`}
                  className="flex items-start gap-4 py-4 transition-colors hover:bg-[var(--accent-soft)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={letter.status} size="sm" />
                      <span className="font-mono text-[0.58rem] text-muted">{letter.serial}</span>
                    </div>
                    <p className="mt-1.5 truncate font-serif text-base">{letter.title || '—'}</p>
                    <p className="mt-1 truncate text-xs text-muted">
                      {excerpt(letter.content, 90) || '—'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-[0.6rem] text-muted">
                      {formatDate(letter.scheduledOpenAt, lang, 'numeric')}
                    </p>
                    {(letter.status === 'SEALED' || letter.status === 'READY') && (
                      <Countdown target={letter.scheduledOpenAt} compact className="text-muted" />
                    )}
                  </div>
                </Link>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

function Section({
  title,
  events,
  nowMarker = false,
}: {
  title: string;
  events: TimelineEvent[];
  nowMarker?: boolean;
}) {
  const { lang } = useI18n();
  const { t } = useI18n();

  return (
    <section>
      <h2 className="eyebrow mb-4">{title}</h2>
      <ol className="relative border-l pl-6" style={{ borderColor: 'var(--border-strong)' }}>
        {nowMarker && (
          <li className="relative -ml-[1.85rem] mb-5 flex items-center gap-2 pl-1">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: 'var(--accent)', boxShadow: '0 0 0 4px var(--accent-soft)' }}
            />
            <span className="font-mono text-[0.6rem] tracking-[0.18em] uppercase" style={{ color: 'var(--accent)' }}>
              {t('timeline.now')}
            </span>
          </li>
        )}
        {events.map((event) => (
          <li key={event.id} className="relative mb-6 last:mb-0">
            <span
              className="absolute -left-[1.65rem] top-1.5 h-2 w-2 rounded-full"
              style={{
                backgroundColor: event.kind === 'opens' ? 'var(--accent)' : 'var(--border-strong)',
              }}
            />
            <Link
              to={
                event.letter.status === 'DRAFT'
                  ? `/compose/${event.letter.id}`
                  : `/letter/${event.letter.id}`
              }
              className="group block"
            >
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span className="font-mono text-[0.62rem] tabular-nums text-muted">
                  {formatDate(event.at, lang, 'numeric')}
                </span>
                <span className="font-mono text-[0.58rem] tracking-[0.14em] uppercase" style={{ color: 'var(--text-muted)' }}>
                  {event.kind === 'opens' ? t('timeline.opens') : t('timeline.created')}
                </span>
                <StatusBadge status={event.letter.status} size="sm" />
              </div>
              <p className="mt-1 font-serif text-base transition-colors group-hover:text-[var(--accent)]">
                {event.letter.title || '—'}
              </p>
              {(event.letter.status === 'SEALED' || event.letter.status === 'READY') &&
                event.kind === 'opens' && (
                  <Countdown target={event.letter.scheduledOpenAt} compact className="mt-1 text-muted" />
                )}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
