/**
 * 导入服务：JSON 备份恢复。
 * 严格要求：格式校验、版本检查、字段补全、重复 ID 检测、
 * 绝不静默覆盖现有数据。
 */

import type { ExportBundle, ImportResult, Letter } from '@/types';
import { DATA_VERSION } from '@/types';
import { db } from '@/services/storage/db';
import { base64ToArrayBuffer } from '@/services/storage/db';
import { refreshDueLetters } from '@/services/storage/letters';
import { nowISO } from '@/utils/date';
import { newId } from '@/services/storage/letters';

export class ImportError extends Error {
  errors: string[];
  constructor(message: string, errors: string[] = []) {
    super(message);
    this.name = 'ImportError';
    this.errors = errors;
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 校验并规范化单封信件 */
function normalizeLetter(raw: unknown): { letter: Letter } | { error: string } {
  if (!isObject(raw)) return { error: '信件条目不是对象' };

  const getStr = (k: string, fallback = ''): string =>
    typeof raw[k] === 'string' ? (raw[k] as string) : fallback;

  const id = getStr('id') || newId();
  const title = getStr('title');
  const content = getStr('content');
  const createdAt = getStr('createdAt') || nowISO();
  const scheduledOpenAt = getStr('scheduledOpenAt');

  if (!scheduledOpenAt) return { error: `信件 ${id} 缺少 scheduledOpenAt` };
  if (Number.isNaN(new Date(scheduledOpenAt).getTime())) {
    return { error: `信件 ${id} 的 scheduledOpenAt 无效` };
  }
  if (Number.isNaN(new Date(createdAt).getTime())) {
    return { error: `信件 ${id} 的 createdAt 无效` };
  }

  const statusRaw = getStr('status', 'SEALED');
  const allowed = ['DRAFT', 'SEALED', 'READY', 'OPENED', 'CANCELLED'] as const;
  const status = (allowed as readonly string[]).includes(statusRaw)
    ? (statusRaw as Letter['status'])
    : 'SEALED';

  const letter: Letter = {
    id,
    serial: getStr('serial') || `FM-${createdAt.slice(0, 4)}-IMPT`,
    title,
    recipient: getStr('recipient', '未来的我'),
    content,
    createdAt,
    updatedAt: getStr('updatedAt') || createdAt,
    scheduledOpenAt,
    sealedAt: getStr('sealedAt') || undefined,
    openedAt: getStr('openedAt') || undefined,
    status,
    kind: (getStr('kind', 'future-self') as Letter['kind']) ?? 'future-self',
    cover: getStr('cover', 'night'),
    tags: Array.isArray(raw.tags) ? (raw.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [],
    attachments: Array.isArray(raw.attachments)
      ? (raw.attachments as unknown[])
          .filter(isObject)
          .map((a) => ({
            id: typeof a.id === 'string' ? a.id : newId(),
            kind: (typeof a.kind === 'string' ? a.kind : 'text') as Letter['attachments'][number]['kind'],
            name: typeof a.name === 'string' ? a.name : 'file',
            mimeType: typeof a.mimeType === 'string' ? a.mimeType : 'application/octet-stream',
            size: typeof a.size === 'number' ? a.size : 0,
            blobKey: typeof a.blobKey === 'string' ? a.blobKey : '',
            externalUrl: typeof a.externalUrl === 'string' ? a.externalUrl : undefined,
            createdAt: typeof a.createdAt === 'string' ? a.createdAt : createdAt,
          }))
      : [],
    mood: isObject(raw.mood) ? (raw.mood as Letter['mood']) : {},
    privacy: raw.privacy === 'shareable' ? 'shareable' : 'private',
    shareQuote: typeof raw.shareQuote === 'string' ? raw.shareQuote : undefined,
    reminder: isObject(raw.reminder)
      ? {
          enabled: Boolean((raw.reminder as Record<string, unknown>).enabled),
          daysBefore:
            typeof (raw.reminder as Record<string, unknown>).daysBefore === 'number'
              ? ((raw.reminder as Record<string, unknown>).daysBefore as number)
              : 0,
        }
      : { enabled: false, daysBefore: 0 },
    replyTo: typeof raw.replyTo === 'string' ? raw.replyTo : undefined,
    replies: Array.isArray(raw.replies)
      ? (raw.replies as unknown[]).filter((r): r is string => typeof r === 'string')
      : [],
    reviewNote: typeof raw.reviewNote === 'string' ? raw.reviewNote : undefined,
    starred: Boolean(raw.starred),
    origin: 'imported',
    version: DATA_VERSION,
  };

  // 保留时间胶囊扩展字段
  if (raw.isCapsule === true) {
    (letter as Letter & Record<string, unknown>).isCapsule = true;
    if (typeof raw.template === 'string') {
      (letter as Letter & Record<string, unknown>).template = raw.template;
    }
    if (isObject(raw.answers)) {
      (letter as Letter & Record<string, unknown>).answers = raw.answers;
    }
    if (Array.isArray(raw.videoLinks)) {
      (letter as Letter & Record<string, unknown>).videoLinks = raw.videoLinks.filter(
        (v): v is string => typeof v === 'string',
      );
    }
  }

  return { letter };
}

/** 解析文本为 bundle，做严格结构校验 */
export function parseBundle(text: string): ExportBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ImportError('JSON 解析失败', ['文件不是合法的 JSON']);
  }
  if (!isObject(parsed)) throw new ImportError('格式不正确', ['根节点不是对象']);
  if (parsed.app !== 'future-mail') {
    throw new ImportError('不是 Future Mail 备份文件', [`app 字段为 ${String(parsed.app)}`]);
  }
  const version = typeof parsed.version === 'number' ? parsed.version : NaN;
  if (!Number.isFinite(version)) throw new ImportError('缺少版本号', ['version 字段无效']);
  if (version > DATA_VERSION) {
    throw new ImportError('版本过新', [
      `备份版本 ${version} 高于当前支持的 ${DATA_VERSION}，请升级应用后再导入`,
    ]);
  }
  if (!Array.isArray(parsed.letters)) {
    throw new ImportError('缺少 letters 数组', ['letters 字段不是数组']);
  }
  return {
    app: 'future-mail',
    version,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : nowISO(),
    letters: parsed.letters as Letter[],
    blobs: Array.isArray(parsed.blobs) ? (parsed.blobs as ExportBundle['blobs']) : undefined,
  };
}

/**
 * 导入：默认策略为「跳过已存在 ID」，不覆盖现有数据。
 * overwrite 为 true 时才允许覆盖（UI 必须二次确认）。
 */
export async function importBundle(
  bundle: ExportBundle,
  options: { overwrite?: boolean } = {},
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, duplicated: 0, invalid: 0, errors: [] };

  const existingIds = new Set((await db.letters.toArray()).map((l) => l.id));
  const toInsert: Letter[] = [];
  const seenInFile = new Set<string>();

  for (const raw of bundle.letters) {
    const normalized = normalizeLetter(raw);
    if ('error' in normalized) {
      result.invalid += 1;
      result.errors.push(normalized.error);
      continue;
    }
    const letter = normalized.letter;
    if (seenInFile.has(letter.id)) {
      result.duplicated += 1;
      result.errors.push(`文件中重复的信件 ID：${letter.id}`);
      continue;
    }
    seenInFile.add(letter.id);

    if (existingIds.has(letter.id) && !options.overwrite) {
      result.skipped += 1;
      continue;
    }
    toInsert.push(letter);
  }

  if (toInsert.length > 0) {
    await db.transaction('rw', db.letters, async () => {
      await db.letters.bulkPut(toInsert);
    });
    result.imported = toInsert.length;
  }

  // 附件（base64 内联）
  if (bundle.blobs && bundle.blobs.length > 0) {
    const rows = bundle.blobs
      .filter((b) => typeof b.base64 === 'string' && b.base64.length > 0)
      .map((b) => ({
        key: b.key,
        letterId: b.letterId,
        mimeType: b.mimeType,
        name: b.name,
        size: b.size,
        data: base64ToArrayBuffer(b.base64),
        createdAt: nowISO(),
      }));
    if (rows.length > 0) {
      await db.transaction('rw', db.blobs, async () => {
        await db.blobs.bulkPut(rows);
      });
    }
  }

  await refreshDueLetters();
  return result;
}

/** 从 File 导入 */
export async function importFromFile(
  file: File,
  options: { overwrite?: boolean } = {},
): Promise<ImportResult> {
  if (file.size > 64 * 1024 * 1024) {
    throw new ImportError('文件过大', ['备份文件不应超过 64MB']);
  }
  const text = await file.text();
  const bundle = parseBundle(text);
  return importBundle(bundle, options);
}
