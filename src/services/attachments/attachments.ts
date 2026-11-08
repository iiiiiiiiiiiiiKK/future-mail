/**
 * 附件服务：类型校验、大小限制、IndexedDB blob 读写。
 * 所有内容只存在本地浏览器，不上传。
 */

import { db } from '@/services/storage/db';
import type { Attachment, AttachmentKind } from '@/types';
import { newId } from '@/services/storage/letters';
import { nowISO } from '@/utils/date';

/** 单文件上限 8MB —— 谨慎对待浏览器配额 */
export const MAX_FILE_SIZE = 8 * 1024 * 1024;
/** 每封信附件上限数量 */
export const MAX_ATTACHMENTS = 10;

const ALLOWED: Array<{ kind: AttachmentKind; mimes: string[]; exts: string[] }> = [
  { kind: 'image', mimes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'], exts: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'] },
  { kind: 'audio', mimes: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/aac'], exts: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'webm'] },
  { kind: 'pdf', mimes: ['application/pdf'], exts: ['pdf'] },
  { kind: 'text', mimes: ['text/plain', 'text/markdown', 'text/csv'], exts: ['txt', 'md', 'csv'] },
];

export function detectKind(file: File): AttachmentKind | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  for (const rule of ALLOWED) {
    if (rule.mimes.includes(file.type)) return rule.kind;
    if (rule.exts.includes(ext)) return rule.kind;
  }
  return null;
}

export interface AttachmentValidationError {
  file: string;
  reason: 'too-large' | 'bad-type' | 'read-failed' | 'quota' | 'too-many';
}

/** 将 File 写入 IndexedDB 并返回 Attachment 元数据 */
export async function saveAttachment(
  file: File,
  letterId: string,
): Promise<{ attachment: Attachment } | { error: AttachmentValidationError }> {
  if (file.size > MAX_FILE_SIZE) {
    return { error: { file: file.name, reason: 'too-large' } };
  }
  const kind = detectKind(file);
  if (!kind) {
    return { error: { file: file.name, reason: 'bad-type' } };
  }

  const key = newId();
  const attachment: Attachment = {
    id: newId(),
    kind,
    name: file.name,
    mimeType: file.type || mimeForExt(file.name),
    size: file.size,
    blobKey: key,
    createdAt: nowISO(),
  };

  try {
    await db.blobs.put({
      key,
      letterId,
      mimeType: attachment.mimeType,
      name: file.name,
      size: file.size,
      blob: file,
      createdAt: attachment.createdAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      error: {
        file: file.name,
        reason: /quota/i.test(message) ? 'quota' : 'read-failed',
      },
    };
  }

  return { attachment };
}

function mimeForExt(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
  };
  return map[ext] ?? 'application/octet-stream';
}

export async function deleteAttachment(letterId: string, attachment: Attachment): Promise<void> {
  await db.blobs.delete(attachment.blobKey);
  const letter = await db.letters.get(letterId);
  if (!letter) return;
  await db.letters.update(letterId, {
    attachments: letter.attachments.filter((a) => a.id !== attachment.id),
    updatedAt: nowISO(),
  });
}

export async function getBlobUrl(key: string): Promise<string | null> {
  const row = await db.blobs.get(key);
  if (!row) return null;
  return URL.createObjectURL(row.blob);
}

export async function getBlob(key: string): Promise<Blob | null> {
  const row = await db.blobs.get(key);
  return row?.blob ?? null;
}

/** 附件是否在数据中存在（用于检测损坏/缺失） */
export async function blobExists(key: string): Promise<boolean> {
  return (await db.blobs.count()) > 0 && Boolean(await db.blobs.get(key));
}
