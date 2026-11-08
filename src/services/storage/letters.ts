/**
 * 信件领域服务：状态机、编号、CRUD。
 * 所有状态转换都在这一层校验，避免前端各处自行改状态。
 */

import type { Letter, LetterStatus } from '@/types';
import { DATA_VERSION } from '@/types';
import { db } from './db';
import { nowISO, parseISO } from '@/utils/date';

/** 允许的状态转换表 */
const TRANSITIONS: Record<LetterStatus, LetterStatus[]> = {
  DRAFT: ['SEALED', 'CANCELLED'],
  SEALED: ['READY', 'CANCELLED'],
  READY: ['OPENED', 'CANCELLED'],
  OPENED: [],
  CANCELLED: [],
};

export function canTransition(from: LetterStatus, to: LetterStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(from: LetterStatus, to: LetterStatus) {
    super(`状态不能从 ${from} 转换到 ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

/** 生成短随机码（不使用 crypto 的强随机要求，仅作人类可读编号） */
function shortCode(length = 4): string {
  const alphabet = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${shortCode(8)}`;
}

/** 信件编号：FM-YYYY-XXXX，按创建年份 */
export function generateSerial(createdAt: string = nowISO()): string {
  const year = (parseISO(createdAt) ?? new Date()).getFullYear();
  return `FM-${year}-${shortCode(4)}`;
}

export interface CreateLetterInput {
  title: string;
  recipient: string;
  content: string;
  scheduledOpenAt: string;
  kind?: Letter['kind'];
  cover?: string;
  tags?: string[];
  attachments?: Letter['attachments'];
  mood?: Letter['mood'];
  reminder?: Letter['reminder'];
  replyTo?: string;
  shareQuote?: string;
  origin?: Letter['origin'];
}

export function draftLetter(input: CreateLetterInput): Letter {
  const createdAt = nowISO();
  return {
    id: newId(),
    serial: generateSerial(createdAt),
    title: input.title,
    recipient: input.recipient,
    content: input.content,
    createdAt,
    updatedAt: createdAt,
    scheduledOpenAt: input.scheduledOpenAt,
    status: 'DRAFT',
    kind: input.kind ?? 'future-self',
    cover: input.cover ?? 'night',
    tags: input.tags ?? [],
    attachments: input.attachments ?? [],
    mood: input.mood,
    privacy: 'private',
    shareQuote: input.shareQuote,
    reminder: input.reminder ?? { enabled: false, daysBefore: 0 },
    replyTo: input.replyTo,
    replies: [],
    starred: false,
    origin: input.origin ?? 'local',
    version: DATA_VERSION,
  };
}

export async function insertLetter(letter: Letter): Promise<Letter> {
  await db.letters.put(letter);
  if (letter.replyTo) {
    const parent = await db.letters.get(letter.replyTo);
    if (parent && !parent.replies.includes(letter.id)) {
      await db.letters.update(parent.id, { replies: [...parent.replies, letter.id] });
    }
  }
  return letter;
}

export async function getLetter(id: string): Promise<Letter | undefined> {
  return db.letters.get(id);
}

export async function listLetters(): Promise<Letter[]> {
  return db.letters.toArray();
}

export async function updateLetter(id: string, patch: Partial<Letter>): Promise<void> {
  await db.letters.update(id, { ...patch, updatedAt: nowISO(), id });
}

/** 仅草稿允许编辑正文 */
export async function saveDraftContent(id: string, patch: Partial<Letter>): Promise<void> {
  const letter = await db.letters.get(id);
  if (!letter) throw new Error('信件不存在');
  if (letter.status !== 'DRAFT') throw new Error('信件已封存，正文不可修改');
  await db.letters.update(id, { ...patch, updatedAt: nowISO() });
}

export async function deleteLetter(id: string): Promise<void> {
  const letter = await db.letters.get(id);
  if (!letter) return;
  await db.transaction('rw', db.letters, db.blobs, async () => {
    const blobs = await db.blobs.where('letterId').equals(id).toArray();
    await db.blobs.bulkDelete(blobs.map((b) => b.key));
    await db.letters.delete(id);
    if (letter.replyTo) {
      const parent = await db.letters.get(letter.replyTo);
      if (parent) {
        await db.letters.update(parent.id, {
          replies: parent.replies.filter((r) => r !== id),
        });
      }
    }
  });
}

/**
 * 封存：DRAFT → SEALED。封存后正文不可修改。
 * 必须传入未来的开启时间。
 */
export async function sealLetter(id: string, scheduledOpenAt: string): Promise<Letter> {
  const letter = await db.letters.get(id);
  if (!letter) throw new Error('信件不存在');
  if (!canTransition(letter.status, 'SEALED')) {
    throw new InvalidTransitionError(letter.status, 'SEALED');
  }
  const openDate = parseISO(scheduledOpenAt);
  if (!openDate) throw new Error('开启日期无效');
  if (openDate.getTime() <= Date.now() + 60_000) {
    throw new Error('开启日期必须在未来');
  }
  if (!letter.content.trim() && letter.attachments.length === 0) {
    throw new Error('信件内容为空，无法封存');
  }
  const sealedAt = nowISO();
  await db.letters.update(id, {
    status: 'SEALED',
    sealedAt,
    scheduledOpenAt,
    updatedAt: sealedAt,
  });
  return { ...letter, status: 'SEALED', sealedAt, scheduledOpenAt };
}

/** 到期判定：SEALED 且已过开启时间 → READY */
export async function refreshDueLetters(now: Date = new Date()): Promise<number> {
  const sealed = await db.letters.where('status').equals('SEALED').toArray();
  const due = sealed.filter((l) => {
    const d = parseISO(l.scheduledOpenAt);
    return d !== null && d.getTime() <= now.getTime();
  });
  if (due.length === 0) return 0;
  await db.transaction('rw', db.letters, async () => {
    for (const letter of due) {
      await db.letters.update(letter.id, {
        status: 'READY',
        updatedAt: nowISO(),
      });
    }
  });
  return due.length;
}

/** 开启信件：READY（或已到期 SEALED） → OPENED */
export async function openLetter(id: string): Promise<Letter> {
  const letter = await db.letters.get(id);
  if (!letter) throw new Error('信件不存在');
  if (letter.status === 'OPENED') return letter;

  const openDate = parseISO(letter.scheduledOpenAt);
  const isDue = openDate !== null && openDate.getTime() <= Date.now();

  if (letter.status === 'SEALED' && isDue) {
    // 允许直接开启已到期但尚未刷新的信件
  } else if (!canTransition(letter.status, 'OPENED')) {
    throw new InvalidTransitionError(letter.status, 'OPENED');
  }

  const openedAt = nowISO();
  await db.letters.update(id, { status: 'OPENED', openedAt, updatedAt: openedAt });
  return { ...letter, status: 'OPENED', openedAt };
}

/** 提前解封：需要二次确认，由 UI 层负责确认，这里只做数据变更 */
export async function earlyOpen(id: string): Promise<Letter> {
  const letter = await db.letters.get(id);
  if (!letter) throw new Error('信件不存在');
  if (letter.status !== 'SEALED' && letter.status !== 'READY') {
    throw new InvalidTransitionError(letter.status, 'OPENED');
  }
  const openedAt = nowISO();
  await db.letters.update(id, { status: 'OPENED', openedAt, updatedAt: openedAt });
  return { ...letter, status: 'OPENED', openedAt };
}

export async function cancelLetter(id: string): Promise<void> {
  const letter = await db.letters.get(id);
  if (!letter) throw new Error('信件不存在');
  if (!canTransition(letter.status, 'CANCELLED')) {
    throw new InvalidTransitionError(letter.status, 'CANCELLED');
  }
  await db.letters.update(id, { status: 'CANCELLED', updatedAt: nowISO() });
}

/** 重新安排开启日期（仅 SEALED 且未到期） */
export async function reschedule(id: string, scheduledOpenAt: string): Promise<void> {
  const letter = await db.letters.get(id);
  if (!letter) throw new Error('信件不存在');
  if (letter.status !== 'SEALED') throw new Error('只有已封存且未开启的信件可以改期');
  const d = parseISO(scheduledOpenAt);
  if (!d || d.getTime() <= Date.now() + 60_000) throw new Error('开启日期必须在未来');
  await db.letters.update(id, { scheduledOpenAt, updatedAt: nowISO() });
}

/** 统计各状态数量，用于档案页签与徽标 */
export function statusCounts(letters: Letter[]): Record<LetterStatus | 'ALL' | 'CAPSULE', number> {
  const counts: Record<string, number> = {
    ALL: letters.length,
    DRAFT: 0,
    SEALED: 0,
    READY: 0,
    OPENED: 0,
    CANCELLED: 0,
    CAPSULE: 0,
  };
  for (const l of letters) {
    counts[l.status] = (counts[l.status] ?? 0) + 1;
    if (isCapsule(l)) counts.CAPSULE += 1;
  }
  return counts as Record<LetterStatus | 'ALL' | 'CAPSULE', number>;
}

export function isCapsule(letter: Letter): boolean {
  return (letter as Letter & { isCapsule?: boolean }).isCapsule === true;
}
