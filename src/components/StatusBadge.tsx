import type { LetterStatus } from '@/types';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/utils/misc';
import type { TranslationKey } from '@/i18n/dictionary';

const STYLE: Record<LetterStatus, { color: string; bg: string; dot: string }> = {
  DRAFT: { color: 'var(--text-secondary)', bg: 'rgba(120,130,150,0.14)', dot: '#7b8698' },
  SEALED: { color: 'var(--accent)', bg: 'var(--accent-soft)', dot: 'var(--accent)' },
  READY: { color: '#4c9a6a', bg: 'rgba(76,154,106,0.16)', dot: '#4c9a6a' },
  OPENED: { color: 'var(--text-muted)', bg: 'rgba(120,130,150,0.1)', dot: '#8d93a1' },
  CANCELLED: { color: '#b06a6a', bg: 'rgba(176,106,106,0.12)', dot: '#b06a6a' },
};

export function StatusBadge({
  status,
  size = 'md',
  className,
}: {
  status: LetterStatus;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const { t } = useI18n();
  const s = STYLE[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-mono uppercase',
        size === 'sm' ? 'px-2 py-0.5 text-[0.58rem]' : 'px-2.5 py-1 text-[0.62rem]',
        className,
      )}
      style={{
        color: s.color,
        backgroundColor: s.bg,
        letterSpacing: '0.12em',
      }}
    >
      <span
        className={cn('rounded-full', size === 'sm' ? 'h-1 w-1' : 'h-1.5 w-1.5')}
        style={{ backgroundColor: s.dot }}
      />
      {t(`letter.status.${status}` as TranslationKey)}
    </span>
  );
}
