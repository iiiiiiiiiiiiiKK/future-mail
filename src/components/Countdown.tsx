import { useEffect, useState } from 'react';
import { countdownParts } from '@/utils/date';
import { cn } from '@/utils/misc';
import { useI18n } from '@/i18n/useI18n';

/** 实时倒计时（每秒刷新），到点后显示可开启 */
export function Countdown({
  target,
  className,
  compact = false,
  onExpire,
}: {
  target: string;
  className?: string;
  compact?: boolean;
  onExpire?: () => void;
}) {
  const { lang } = useI18n();
  const [parts, setParts] = useState(() => countdownParts(new Date(target)));
  const [fired, setFired] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      const next = countdownParts(new Date(target));
      setParts(next);
      if (next.expired && !fired) {
        setFired(true);
        onExpire?.();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [target, fired, onExpire]);

  if (parts.expired) {
    return (
      <span className={cn('font-mono text-xs tracking-[0.14em] uppercase', className)}
        style={{ color: 'var(--accent)' }}>
        {lang === 'zh' ? '已到开启时间' : 'Ready to open'}
      </span>
    );
  }

  if (compact) {
    return (
      <span className={cn('font-mono text-xs tabular-nums', className)}>
        {parts.days}d {String(parts.hours).padStart(2, '0')}h{' '}
        {String(parts.minutes).padStart(2, '0')}m
      </span>
    );
  }

  const cells = [
    { v: parts.days, l: lang === 'zh' ? '天' : 'DAYS' },
    { v: parts.hours, l: lang === 'zh' ? '时' : 'HRS' },
    { v: parts.minutes, l: lang === 'zh' ? '分' : 'MIN' },
    { v: parts.seconds, l: lang === 'zh' ? '秒' : 'SEC' },
  ];

  return (
    <div className={cn('flex items-end gap-3 tabular-nums', className)}>
      {cells.map((c) => (
        <div key={c.l} className="flex flex-col items-center">
          <span className="font-serif text-xl leading-none sm:text-2xl">
            {String(c.v).padStart(2, '0')}
          </span>
          <span className="mt-1 font-mono text-[0.55rem] tracking-[0.16em] text-muted">{c.l}</span>
        </div>
      ))}
    </div>
  );
}
