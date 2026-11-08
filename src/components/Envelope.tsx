import type { CSSProperties } from 'react';
import { cn } from '@/utils/misc';

/**
 * 具有真实信件质感的信封。
 * 纯 CSS 绘制：信封主体、封盖三角、蜡封、地址线。
 */

export function Envelope({
  to,
  openDate,
  status,
  sealLabel = 'FM',
  className,
  style,
  size = 'lg',
  sealed = true,
}: {
  to: string;
  openDate: string;
  status: string;
  sealLabel?: string;
  className?: string;
  style?: CSSProperties;
  size?: 'sm' | 'md' | 'lg';
  sealed?: boolean;
}) {
  const dims =
    size === 'lg'
      ? { w: '100%', maxW: 460, ratio: '1.55', pad: 'clamp(1.1rem, 4vw, 2rem)' }
      : size === 'md'
        ? { w: '100%', maxW: 340, ratio: '1.5', pad: '1rem' }
        : { w: '100%', maxW: 260, ratio: '1.5', pad: '0.85rem' };

  return (
    <div
      className={cn('relative mx-auto', className)}
      style={{ width: dims.w, maxWidth: dims.maxW, aspectRatio: dims.ratio, ...style }}
    >
      {/* 信封主体 */}
      <div
        className="paper-grain absolute inset-0 overflow-hidden rounded-[10px]"
        style={{
          background:
            'linear-gradient(152deg, #f7f0e0 0%, #efe5d0 46%, #e7dbc2 100%)',
          boxShadow:
            '0 1px 0 rgba(255,255,255,0.6) inset, 0 18px 50px -24px rgba(12,18,32,0.55), 0 2px 6px rgba(12,18,32,0.12)',
          border: '1px solid rgba(122,101,64,0.24)',
        }}
      >
        {/* 折线（信封背面的三角折痕） */}
        <svg
          viewBox="0 0 320 208"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <path d="M0 0 L160 92 L320 0" fill="none" stroke="rgba(122,101,64,0.2)" strokeWidth="1" />
          <path d="M0 208 L120 74" fill="none" stroke="rgba(122,101,64,0.12)" strokeWidth="1" />
          <path d="M320 208 L200 74" fill="none" stroke="rgba(122,101,64,0.12)" strokeWidth="1" />
        </svg>

        {/* 封盖三角 */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0"
          style={{
            height: '58%',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.5), rgba(226,214,190,0.35))',
            clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
            opacity: sealed ? 1 : 0.35,
            transition: 'opacity 600ms ease',
          }}
        />

        {/* 内容区 */}
        <div
          className="relative flex h-full flex-col justify-between"
          style={{ padding: dims.pad }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                className="font-mono uppercase truncate"
                style={{
                  fontSize: size === 'sm' ? '0.55rem' : '0.65rem',
                  letterSpacing: '0.22em',
                  color: 'rgba(74,60,36,0.72)',
                }}
              >
                {to}
              </p>
              <div
                className="mt-1.5 h-[1px] w-14"
                style={{ backgroundColor: 'rgba(122,101,64,0.35)' }}
              />
            </div>
            {sealed && <SealAlone label={sealLabel} small={size !== 'lg'} />}
          </div>

          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p
                className="font-mono uppercase"
                style={{
                  fontSize: size === 'sm' ? '0.5rem' : '0.6rem',
                  letterSpacing: '0.2em',
                  color: 'rgba(74,60,36,0.55)',
                }}
              >
                OPEN DATE
              </p>
              <p
                className="mt-1 font-serif tabular-nums"
                style={{
                  fontSize: size === 'sm' ? '0.85rem' : size === 'md' ? '1rem' : '1.15rem',
                  letterSpacing: '0.04em',
                  color: 'rgba(52,41,22,0.92)',
                }}
              >
                {openDate}
              </p>
            </div>
            <p
              className="shrink-0 font-mono uppercase"
              style={{
                fontSize: size === 'sm' ? '0.5rem' : '0.6rem',
                letterSpacing: '0.2em',
                color: 'rgba(74,60,36,0.62)',
              }}
            >
              {status}
            </p>
          </div>
        </div>

        {/* 底部暗金细线 */}
        <div
          className="absolute inset-x-0 bottom-0 h-[3px]"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(191,150,72,0.55), transparent)' }}
        />
      </div>
    </div>
  );
}

export function SealAlone({ label = 'FM', small = false }: { label?: string; small?: boolean }) {
  const s = small ? 34 : 46;
  return (
    <div
      className="relative flex shrink-0 items-center justify-center rounded-full animate-seal-pulse"
      style={{
        width: s,
        height: s,
        background:
          'radial-gradient(circle at 34% 30%, #c9553f 0%, #a13a2c 55%, #7d2a20 100%)',
        boxShadow:
          '0 1px 2px rgba(0,0,0,0.35), inset 0 1px 2px rgba(255,255,255,0.28), inset 0 -2px 5px rgba(0,0,0,0.28)',
      }}
      aria-hidden="true"
    >
      <span
        className="font-serif tracking-[0.08em]"
        style={{
          fontSize: small ? '0.55rem' : '0.68rem',
          color: 'rgba(255,236,214,0.92)',
          textShadow: '0 1px 1px rgba(0,0,0,0.4)',
        }}
      >
        {label}
      </span>
      <span
        className="absolute inset-[3px] rounded-full"
        style={{ border: '1px dashed rgba(255,220,190,0.32)' }}
      />
    </div>
  );
}
