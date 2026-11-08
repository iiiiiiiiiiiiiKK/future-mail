/**
 * 作者署名 + X 链接。
 * 需求：顶部增加作者 𝕏 超链接 https://x.com/0xkillcoin
 */

import { useI18n } from '@/i18n/useI18n';

export const AUTHOR_X_URL = 'https://x.com/0xkillcoin';
export const AUTHOR_HANDLE = '@0xkillcoin';

/** X (Twitter) 官方字形，内联 SVG 以避免外部资源请求 */
function XGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function AuthorXLink({
  variant = 'header',
}: {
  variant?: 'header' | 'footer' | 'badge';
}) {
  const { t } = useI18n();

  if (variant === 'badge') {
    return (
      <a
        href={AUTHOR_X_URL}
        target="_blank"
        rel="noopener noreferrer"
        title={t('brand.xTitle')}
        className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs tracking-[0.08em] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
        style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
      >
        <XGlyph className="h-3 w-3" />
        <span className="font-mono">{AUTHOR_HANDLE}</span>
      </a>
    );
  }

  const isFooter = variant === 'footer';

  return (
    <a
      href={AUTHOR_X_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={t('brand.xTitle')}
      aria-label={`${t('brand.by')} ${AUTHOR_HANDLE} — X`}
      className={
        isFooter
          ? 'group inline-flex items-center gap-2 text-xs transition-colors hover:text-[var(--accent)]'
          : 'group inline-flex min-h-[40px] items-center gap-2 rounded-full border px-3 text-xs transition-all hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]'
      }
      style={
        isFooter
          ? { color: 'var(--text-muted)' }
          : { borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }
      }
    >
      <XGlyph
        className={
          isFooter
            ? 'h-3 w-3 transition-transform group-hover:scale-110'
            : 'h-3.5 w-3.5 transition-transform group-hover:scale-110'
        }
      />
      {/* 移动端只显示图标，桌面端显示完整 handle */}
      <span className={isFooter ? 'font-mono tracking-[0.12em]' : 'hidden font-mono tracking-[0.12em] sm:inline'}>
        {AUTHOR_HANDLE}
      </span>
    </a>
  );
}
