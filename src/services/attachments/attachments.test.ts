import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '@/services/storage/db';
import {
  MAX_ATTACHMENTS,
  MAX_FILE_SIZE,
  blobExists,
  deleteAttachment,
  detectKind,
  getBlob,
  saveAttachment,
} from '@/services/attachments/attachments';
import { draftLetter, insertLetter } from '@/services/storage/letters';
import { addYearsClamped } from '@/utils/date';

const future = (y = 1) => addYearsClamped(new Date(), y).toISOString();

function makeFile(name: string, content: string, type: string): File {
  return new File([content], name, { type });
}

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await db.letters.clear();
  await db.blobs.clear();
});

describe('detectKind 类型校验', () => {
  it('识别图片 / 音频 / PDF / 文本', () => {
    expect(detectKind(makeFile('a.png', 'x', 'image/png'))).toBe('image');
    expect(detectKind(makeFile('a.mp3', 'x', 'audio/mpeg'))).toBe('audio');
    expect(detectKind(makeFile('a.pdf', 'x', 'application/pdf'))).toBe('pdf');
    expect(detectKind(makeFile('a.txt', 'x', 'text/plain'))).toBe('text');
  });

  it('按扩展名兜底（MIME 为空时）', () => {
    expect(detectKind(makeFile('photo.JPG', 'x', ''))).toBe('image');
    expect(detectKind(makeFile('notes.md', 'x', ''))).toBe('text');
  });

  it('拒绝可执行文件与未知类型', () => {
    expect(detectKind(makeFile('evil.exe', 'x', 'application/x-msdownload'))).toBeNull();
    expect(detectKind(makeFile('a.zip', 'x', 'application/zip'))).toBeNull();
  });
});

describe('saveAttachment', () => {
  it('写入 IndexedDB 并返回元数据', async () => {
    const letter = draftLetter({
      title: 't',
      recipient: 'me',
      content: 'c',
      scheduledOpenAt: future(1),
    });
    await insertLetter(letter);

    const file = makeFile('note.txt', 'hello world', 'text/plain');
    const result = await saveAttachment(file, letter.id);
    expect('attachment' in result).toBe(true);
    if (!('attachment' in result)) return;

    expect(result.attachment.kind).toBe('text');
    expect(result.attachment.size).toBe(file.size);
    expect(await blobExists(result.attachment.blobKey)).toBe(true);

    /* jsdom + fake-indexeddb 对 Blob 的结构化克隆不保留全部属性，
       因此以存储行上的元数据作为断言依据（真实浏览器中 blob 完整可用）。 */
    const blob = await getBlob(result.attachment.blobKey);
    expect(blob).toBeTruthy();
    const row = await db.blobs.get(result.attachment.blobKey);
    expect(row?.size).toBe(file.size);
    expect(row?.mimeType).toBe('text/plain');
    expect(row?.letterId).toBe(letter.id);
  });

  it('拒绝超过大小限制的文件', async () => {
    const big = new File([new Uint8Array(MAX_FILE_SIZE + 10)], 'big.png', { type: 'image/png' });
    const result = await saveAttachment(big, 'letter-1');
    expect('error' in result && result.error.reason).toBe('too-large');
  });

  it('拒绝不支持的类型', async () => {
    const result = await saveAttachment(makeFile('a.exe', 'MZ', 'application/x-msdownload'), 'l');
    expect('error' in result && result.error.reason).toBe('bad-type');
  });

  it('MAX_ATTACHMENTS 常量合理', () => {
    expect(MAX_ATTACHMENTS).toBeGreaterThan(0);
    expect(MAX_FILE_SIZE).toBe(8 * 1024 * 1024);
  });
});

describe('deleteAttachment', () => {
  it('同时移除 blob 与信件上的引用', async () => {
    const letter = draftLetter({
      title: 't',
      recipient: 'me',
      content: 'c',
      scheduledOpenAt: future(1),
    });
    await insertLetter(letter);

    const saved = await saveAttachment(makeFile('a.txt', 'x', 'text/plain'), letter.id);
    if (!('attachment' in saved)) throw new Error('保存失败');
    const attachment = saved.attachment;

    await db.letters.update(letter.id, { attachments: [attachment] });
    await deleteAttachment(letter.id, attachment);

    expect(await getBlob(attachment.blobKey)).toBeNull();
    const stored = await db.letters.get(letter.id);
    expect(stored?.attachments).toHaveLength(0);
  });
});
