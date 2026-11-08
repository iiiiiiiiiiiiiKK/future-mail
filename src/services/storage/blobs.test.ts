import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { db, arrayBufferToBase64, base64ToArrayBuffer } from '@/services/storage/db';
import { saveAttachment, getBlob, blobExists } from '@/services/attachments/attachments';
import { draftLetter, insertLetter } from '@/services/storage/letters';
import { addYearsClamped } from '@/utils/date';

const future = (y = 1) => addYearsClamped(new Date(), y).toISOString();

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await db.letters.clear();
  await db.blobs.clear();
});

describe('base64 <-> ArrayBuffer 往返', () => {
  it('二进制逐字节保持不变', () => {
    /* 包含 0x00 与 0xFF，验证不是按字符串处理 */
    const bytes = new Uint8Array([0, 1, 2, 127, 128, 200, 254, 255]);
    const base64 = arrayBufferToBase64(bytes.buffer);
    const restored = new Uint8Array(base64ToArrayBuffer(base64));
    expect(Array.from(restored)).toEqual(Array.from(bytes));
  });

  it('空缓冲区安全', () => {
    expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe('');
    expect(base64ToArrayBuffer('').byteLength).toBe(0);
  });

  it('大缓冲区分段编码正确', () => {
    const size = 200_000;
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i += 1) bytes[i] = i % 256;
    const base64 = arrayBufferToBase64(bytes.buffer);
    const restored = new Uint8Array(base64ToArrayBuffer(base64));
    expect(restored.length).toBe(size);
    expect(restored[0]).toBe(0);
    expect(restored[255]).toBe(255);
    expect(restored[size - 1]).toBe((size - 1) % 256);
  });
});

describe('附件以 ArrayBuffer 持久化', () => {
  it('存储行保留原始字节，读取时重建可用的 Blob', async () => {
    const letter = draftLetter({
      title: 't',
      recipient: 'me',
      content: 'c',
      scheduledOpenAt: future(1),
    });
    await insertLetter(letter);

    const payload = 'Future Mail 附件二进制验证';
    const file = new File([payload], 'a.txt', { type: 'text/plain' });
    const result = await saveAttachment(file, letter.id);
    expect('attachment' in result).toBe(true);
    if (!('attachment' in result)) return;

    expect(await blobExists(result.attachment.blobKey)).toBe(true);

    const row = await db.blobs.get(result.attachment.blobKey);
    /* fake-indexeddb 的结构化克隆可能把 ArrayBuffer 还原为等价的字节视图，
       因此在测试中以「可读取的字节长度」为断言，浏览器中即为 ArrayBuffer。 */
    expect(row).toBeTruthy();
    const storedBytes = new Uint8Array(row!.data as ArrayBufferLike);
    expect(storedBytes.byteLength).toBe(file.size);
    expect(new TextDecoder().decode(storedBytes)).toBe(payload);

    const blob = await getBlob(result.attachment.blobKey);
    expect(blob).toBeTruthy();
    expect(blob!.type).toBe('text/plain');
    expect(blob!.size).toBe(file.size);
  });
});
