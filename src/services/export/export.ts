/**
 * 导出服务：JSON 全量备份、单封 Markdown、单封 PDF。
 * PDF 由浏览器端 jsPDF 生成，不联网。
 */

import { jsPDF } from 'jspdf';
import type { Letter } from '@/types';
import { buildExportBundle, db } from '@/services/storage/db';
import { formatDate } from '@/utils/date';
import { downloadBlob } from '@/utils/misc';
import { stampForFilename } from '@/utils/date';
import { translate } from '@/i18n/useI18n';
import type { Lang } from '@/i18n/dictionary';
import { getMood } from '@/features/compose/themes';

export async function exportAllJson(includeBlobs = true): Promise<Blob> {
  const bundle = await buildExportBundle(includeBlobs);
  return new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
}

export async function downloadAllJson(includeBlobs = true): Promise<void> {
  const blob = await exportAllJson(includeBlobs);
  downloadBlob(blob, `future-mail-backup-${stampForFilename()}.json`);
}

/** 单封 Markdown 文本 */
export function letterToMarkdown(letter: Letter, lang: Lang): string {
  const lines: string[] = [];
  lines.push(`# ${letter.title || translate(lang, 'compose.titlePlaceholder')}`);
  lines.push('');
  lines.push(`> ${translate(lang, 'compose.writeTo')}: ${letter.recipient}`);
  lines.push(`>`);
  lines.push(`> ${translate(lang, 'letter.serial')}: ${letter.serial}`);
  lines.push(`> ${translate(lang, 'letter.createdAt')}: ${formatDate(letter.createdAt, lang, 'long')}`);
  lines.push(`> ${translate(lang, 'letter.openAt')}: ${formatDate(letter.scheduledOpenAt, lang, 'long')}`);
  if (letter.sealedAt)
    lines.push(`> ${translate(lang, 'letter.sealedAt')}: ${formatDate(letter.sealedAt, lang, 'long')}`);
  if (letter.openedAt)
    lines.push(`> ${translate(lang, 'letter.openedAt')}: ${formatDate(letter.openedAt, lang, 'long')}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(letter.content || '');

  if (letter.mood && Object.values(letter.mood).some(Boolean)) {
    lines.push('');
    lines.push(`## ${translate(lang, 'letter.mood')}`);
    lines.push('');
    const mood = getMood(letter.mood.mood);
    if (mood) lines.push(`- ${lang === 'zh' ? mood.zh : mood.en}`);
    const fields: Array<[keyof typeof letter.mood, string]> = [
      ['mostImportant', translate(lang, 'compose.mood.mostImportant')],
      ['workingOn', translate(lang, 'compose.mood.workingOn')],
      ['biggestWorry', translate(lang, 'compose.mood.biggestWorry')],
      ['lookingForwardTo', translate(lang, 'compose.mood.lookingForwardTo')],
      ['hopeForFuture', translate(lang, 'compose.mood.hopeForFuture')],
      ['city', translate(lang, 'compose.mood.city')],
      ['currentGoal', translate(lang, 'compose.mood.currentGoal')],
    ];
    for (const [key, label] of fields) {
      const value = letter.mood[key];
      if (typeof value === 'string' && value.trim()) lines.push(`- ${label}: ${value}`);
    }
  }

  if (letter.reviewNote) {
    lines.push('');
    lines.push(`## ${translate(lang, 'letter.reviewNote')}`);
    lines.push('');
    lines.push(letter.reviewNote);
  }

  if (letter.attachments.length > 0) {
    lines.push('');
    lines.push(`## ${translate(lang, 'letter.attachments')}`);
    lines.push('');
    for (const a of letter.attachments) {
      lines.push(`- ${a.name} (${a.kind}, ${a.size} bytes)`);
    }
  }

  lines.push('');
  lines.push('---');
  lines.push(`*Future Mail · ${letter.serial} · https://x.com/0xkillcoin*`);
  return lines.join('\n');
}

export function downloadLetterMarkdown(letter: Letter, lang: Lang): void {
  const md = letterToMarkdown(letter, lang);
  downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${safeName(letter)}.md`);
}

function safeName(letter: Letter): string {
  const base = (letter.title || letter.serial).replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
  return `${base}-${letter.serial}`;
}

/**
 * PDF 导出：中文使用内置无衬线回退（jsPDF 无中文字体时降级为英文标签 + 原文逐行写入）。
 * 为避免引入数 MB 的 CJK 字体，正文中文通过 canvas 截图方式保证可读。
 */
export async function downloadLetterPdf(letter: Letter, lang: Lang): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 56;
  const usable = pageWidth - margin * 2;

  // 头部
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(140, 140, 140);
  doc.text('FUTURE MAIL', margin, margin - 18);

  doc.setFontSize(20);
  doc.setTextColor(30, 30, 30);
  const title = doc.splitTextToSize(letter.title || letter.serial, usable);
  doc.text(title, margin, margin + 6);

  let y = margin + 12 + title.length * 22;

  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  const meta = [
    `${translate(lang, 'letter.serial')}: ${letter.serial}`,
    `${translate(lang, 'compose.writeTo')}: ${letter.recipient}`,
    `${translate(lang, 'letter.createdAt')}: ${formatDate(letter.createdAt, lang, 'numeric')}`,
    `${translate(lang, 'letter.openAt')}: ${formatDate(letter.scheduledOpenAt, lang, 'numeric')}`,
  ];
  if (letter.openedAt)
    meta.push(
      `${translate(lang, 'letter.openedAt')}: ${formatDate(letter.openedAt, lang, 'numeric')}`,
    );
  for (const line of meta) {
    doc.text(line, margin, y);
    y += 14;
  }

  // 正文：通过离屏 canvas 绘制，保证中文正常显示
  const bodyText = letter.content || '';
  if (bodyText.trim()) {
    const imageData = await renderTextToImage(bodyText, usable, pageWidth);
    y += 10;
    let remainingHeight = pageHeight - y - margin;
    let offset = 0;
    const scale = usable / imageData.width;

    const img = await loadImage(imageData.dataUrl);

    while (offset < imageData.height) {
      const sliceHeight = Math.min(remainingHeight / scale, imageData.height - offset);
      const slice = sliceRenderedImage(img, imageData, offset, sliceHeight);
      doc.addImage(slice, 'PNG', margin, y, usable, sliceHeight * scale);
      offset += sliceHeight;
      if (offset < imageData.height) {
        doc.addPage();
        y = margin;
        remainingHeight = pageHeight - y - margin;
      }
    }
  }

  doc.save(`${safeName(letter)}.pdf`);
}

interface RenderedText {
  dataUrl: string;
  width: number;
  height: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解码失败'));
    img.src = src;
  });
}

/** 把文本渲染成高分辨率位图，返回 dataUrl 与像素尺寸 */
function renderTextToImage(text: string, cssWidth: number, maxWidth: number): Promise<RenderedText> {
  return new Promise((resolve, reject) => {
    const scale = 2;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas 不可用'));
      return;
    }
    const width = Math.min(cssWidth, maxWidth) * scale;
    const fontSize = 12.5 * scale;
    const lineHeight = fontSize * 1.85;
    const padding = 0;

    ctx.font = `${fontSize}px "Songti SC", "Noto Serif SC", "Microsoft YaHei", serif`;

    const paragraphs = text.replace(/\r\n/g, '\n').split('\n');
    const wrapped: string[] = [];
    for (const para of paragraphs) {
      if (!para.trim()) {
        wrapped.push('');
        continue;
      }
      let line = '';
      for (const char of para) {
        const test = line + char;
        if (ctx.measureText(test).width > width - padding * 2) {
          wrapped.push(line);
          line = char;
        } else {
          line = test;
        }
      }
      if (line) wrapped.push(line);
    }

    canvas.width = Math.ceil(width);
    canvas.height = Math.ceil(wrapped.length * lineHeight) + 8;
    // 尺寸变化后需要重新设置字体
    ctx.font = `${fontSize}px "Songti SC", "Noto Serif SC", "Microsoft YaHei", serif`;
    ctx.fillStyle = '#1a1a1a';
    ctx.textBaseline = 'top';
    wrapped.forEach((line, i) => {
      ctx.fillText(line, padding, i * lineHeight + 4);
    });

    resolve({ dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height });
  });
}

/** 从已解码的图片中裁剪一段（用于跨页） */
function sliceRenderedImage(
  img: HTMLImageElement,
  image: RenderedText,
  offsetY: number,
  height: number,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = Math.max(1, Math.ceil(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) return image.dataUrl;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(
    img,
    0,
    Math.floor(offsetY),
    image.width,
    Math.ceil(height),
    0,
    0,
    image.width,
    Math.ceil(height),
  );
  return canvas.toDataURL('image/png');
}

/** 导出所有附件（逐个下载，浏览器不支持打包 zip 时不引入额外依赖） */
export async function downloadAllAttachments(letter: Letter): Promise<number> {
  let count = 0;
  for (const attachment of letter.attachments) {
    const row = await db.blobs.get(attachment.blobKey);
    if (!row) continue;
    downloadBlob(row.blob, attachment.name);
    count += 1;
    await new Promise((r) => setTimeout(r, 220));
  }
  return count;
}
