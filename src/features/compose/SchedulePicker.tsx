import { useMemo, useState } from 'react';
import { CalendarDays, Check } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import {
  formatDate,
  fromDateTimeLocalValue,
  humanizeRemaining,
  isValidFutureDate,
  offsetToDate,
  toDateTimeLocalValue,
  type QuickOffset,
} from '@/utils/date';

const QUICK: Array<{ id: QuickOffset; zh: string; en: string }> = [
  { id: '1m', zh: '1 个月后', en: '1 month' },
  { id: '3m', zh: '3 个月后', en: '3 months' },
  { id: '6m', zh: '6 个月后', en: '6 months' },
  { id: '1y', zh: '1 年后', en: '1 year' },
  { id: '3y', zh: '3 年后', en: '3 years' },
  { id: '5y', zh: '5 年后', en: '5 years' },
  { id: '10y', zh: '10 年后', en: '10 years' },
];

export function SchedulePicker({
  value,
  onChange,
  disabled = false,
  showSummary = true,
}: {
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  showSummary?: boolean;
}) {
  const { t, lang } = useI18n();
  const current = useMemo(() => new Date(value), [value]);

  /** 输入框草稿：仅在用户输入了与当前值不一致的文本时使用，避免 effect 同步 */
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const draftDate = draft === null ? null : fromDateTimeLocalValue(draft);
  const showDraft = draft !== null && (!draftDate || draftDate.getTime() !== current.getTime());
  const inputValue = showDraft && draft !== null ? draft : toDateTimeLocalValue(current);

  const activeQuick = useMemo(() => {
    const now = new Date();
    for (const q of QUICK) {
      const d = offsetToDate(q.id, now);
      if (Math.abs(d.getTime() - current.getTime()) < 90 * 60 * 1000) return q.id;
    }
    return null;
  }, [current]);

  const applyQuick = (id: QuickOffset) => {
    const d = offsetToDate(id, new Date());
    setDraft(null);
    setError(null);
    onChange(d.toISOString());
  };

  const applyCustom = (raw: string) => {
    setDraft(raw);
    const d = fromDateTimeLocalValue(raw);
    if (!d || !isValidFutureDate(d)) {
      setError(t('compose.invalidDate'));
      return;
    }
    setError(null);
    onChange(d.toISOString());
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button
            key={q.id}
            type="button"
            className="chip"
            data-active={activeQuick === q.id}
            onClick={() => applyQuick(q.id)}
            disabled={disabled}
          >
            {activeQuick === q.id && <Check className="h-3 w-3" />}
            {lang === 'zh' ? q.zh : q.en}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <label
          className="mb-1.5 flex items-center gap-1.5 font-mono text-[0.62rem] tracking-[0.14em] uppercase text-muted"
          htmlFor="schedule-custom"
        >
          <CalendarDays className="h-3 w-3" />
          {t('compose.customDate')}
        </label>
        <input
          id="schedule-custom"
          type="datetime-local"
          className="field"
          value={inputValue}
          onChange={(e) => applyCustom(e.target.value)}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'schedule-error' : undefined}
        />
        {error && (
          <p id="schedule-error" className="mt-1.5 text-xs" style={{ color: '#d06060' }}>
            {error}
          </p>
        )}
      </div>

      {showSummary && (
        <dl
          className="mt-4 grid grid-cols-1 gap-2 rounded-lg border p-3 text-xs sm:grid-cols-3"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div>
            <dt className="font-mono text-[0.58rem] tracking-[0.14em] uppercase text-muted">
              {t('compose.createdAt')}
            </dt>
            <dd className="mt-1 tabular-nums">{formatDate(new Date(), lang, 'numeric')}</dd>
          </div>
          <div>
            <dt className="font-mono text-[0.58rem] tracking-[0.14em] uppercase text-muted">
              {t('compose.openAt')}
            </dt>
            <dd className="mt-1 tabular-nums" style={{ color: 'var(--accent)' }}>
              {formatDate(current, lang, 'numeric')}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[0.58rem] tracking-[0.14em] uppercase text-muted">
              {t('compose.remaining')}
            </dt>
            <dd className="mt-1 tabular-nums">
              {isValidFutureDate(current) ? humanizeRemaining(current, new Date(), lang) : '—'}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}
