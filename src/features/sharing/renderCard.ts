/**
 * 分享卡片渲染（Canvas）
 * 隐私：默认隐藏正文，只渲染用户主动填写的一句公开文字。
 * 不生成任何可访问私人信件的链接。
 */

import type { Letter } from '@/types';
import { getCover } from '@/features/compose/themes';
import { calendarDaysBetween, formatDate, parseISO } from '@/utils/date';
import type { Lang } from '@/i18n/dictionary';

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

export interface CardOptions {
  letter: Letter;
  quote: string;
  lang: Lang;
  brandHandle?: string;
}

/** 文本按宽度换行（逐字符，兼容中英混排） */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n');
  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const char of para) {
      const test = line + char;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = char;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export async function renderShareCard({
  letter,
  quote,
  lang,
  brandHandle = '@0xkillcoin',
}: CardOptions): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const scale = 1;
  canvas.width = CARD_WIDTH * scale;
  canvas.height = CARD_HEIGHT * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 不可用');

  const cover = getCover(letter.cover);
  const W = canvas.width;
  const H = canvas.height;
  const pad = 84;

  /* 背景：封面渐变 */
  const gradient = ctx.createLinearGradient(0, 0, W, H);
  const stops = parseGradientStops(cover.gradient);
  stops.forEach((stop) => gradient.addColorStop(stop.at, stop.color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  /* 细网格纹理 */
  ctx.strokeStyle = hexToRgba(cover.accent, 0.07);
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 54) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 54) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  /* 内框 */
  ctx.strokeStyle = hexToRgba(cover.accent, 0.32);
  ctx.lineWidth = 2;
  ctx.strokeRect(pad / 2, pad / 2, W - pad, H - pad);

  /* 顶部品牌 */
  ctx.fillStyle = cover.accent;
  ctx.font = '600 30px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = '8px';
  ctx.fillText('FUTURE MAIL', pad, pad + 46);
  ctx.letterSpacing = '0px';

  ctx.font = '400 22px "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = hexToRgba(cover.accent, 0.62);
  ctx.fillText('A MESSAGE TO YOUR FUTURE SELF', pad, pad + 82);

  /* 中央分隔线 */
  ctx.strokeStyle = hexToRgba(cover.accent, 0.28);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, pad + 120);
  ctx.lineTo(W - pad, pad + 120);
  ctx.stroke();

  /* 标题 */
  ctx.fillStyle = cover.accent;
  ctx.font = '500 62px "Iowan Old Style", "Songti SC", "Noto Serif SC", Georgia, serif';
  const titleLines = wrapText(ctx, letter.title || letter.serial, W - pad * 2).slice(0, 3);
  let cursorY = pad + 210;
  for (const line of titleLines) {
    ctx.fillText(line, pad, cursorY);
    cursorY += 78;
  }

  /* 公开引语 */
  if (quote.trim()) {
    cursorY += 30;
    ctx.fillStyle = hexToRgba(cover.accent, 0.9);
    ctx.font = '400 40px "Iowan Old Style", "Songti SC", "Noto Serif SC", Georgia, serif';
    const quoteLines = wrapText(ctx, `“${quote.trim()}”`, W - pad * 2).slice(0, 8);
    for (const line of quoteLines) {
      ctx.fillText(line, pad, cursorY);
      cursorY += 62;
    }
  }

  /* 底部信息块 */
  const created = parseISO(letter.createdAt);
  const opened = parseISO(letter.openedAt ?? '') ?? new Date();
  const span = created ? calendarDaysBetween(created, opened) : 0;

  const yearsOpen = parseISO(letter.scheduledOpenAt)?.getFullYear() ?? 0;
  const yearsCreated = created?.getFullYear() ?? 0;

  const baseY = H - pad - 200;
  ctx.strokeStyle = hexToRgba(cover.accent, 0.22);
  ctx.beginPath();
  ctx.moveTo(pad, baseY - 54);
  ctx.lineTo(W - pad, baseY - 54);
  ctx.stroke();

  const cells = [
    {
      label: lang === 'zh' ? '写下年份' : 'WRITTEN',
      value: String(yearsCreated),
    },
    {
      label: lang === 'zh' ? '开启年份' : 'OPENED',
      value: String(yearsOpen),
    },
    {
      label: lang === 'zh' ? '时间跨度' : 'SPAN',
      value: lang === 'zh' ? `${span} 天` : `${span} days`,
    },
  ];

  const cellWidth = (W - pad * 2) / 3;
  cells.forEach((cell, i) => {
    const x = pad + cellWidth * i;
    ctx.fillStyle = hexToRgba(cover.accent, 0.55);
    ctx.font = '400 20px "Helvetica Neue", Arial, sans-serif';
    ctx.letterSpacing = '4px';
    ctx.fillText(cell.label, x, baseY);
    ctx.letterSpacing = '0px';

    ctx.fillStyle = cover.accent;
    ctx.font = '500 42px "Iowan Old Style", Georgia, serif';
    ctx.fillText(cell.value, x, baseY + 54);
  });

  /* 底部签名 */
  ctx.fillStyle = hexToRgba(cover.accent, 0.5);
  ctx.font = '400 20px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(
    `${letter.serial}  ·  ${brandHandle}  ·  ${formatDate(new Date(), lang, 'numeric')}`,
    pad,
    H - pad + 6,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('导出图片失败'));
    }, 'image/png');
  });
}

/** 解析 `linear-gradient(146deg, #a 0%, #b 60%)` 的色标 */
function parseGradientStops(css: string): Array<{ at: number; color: string }> {
  const matches = css.match(/#[0-9a-fA-F]{3,8}\s+\d+%/g) ?? [];
  if (matches.length === 0) return [{ at: 0, color: '#0d1526' }];
  return matches.map((m) => {
    const [color, pct] = m.split(/\s+/);
    return { at: Number(pct.replace('%', '')) / 100, color };
  });
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean.split('').map((c) => c + c).join('')
      : clean.slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
