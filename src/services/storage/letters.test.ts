import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '@/services/storage/db';
import { DATA_VERSION } from '@/types';
import {
  canTransition,
  cancelLetter,
  deleteLetter,
  draftLetter,
  earlyOpen,
  generateSerial,
  getLetter,
  insertLetter,
  listLetters,
  newId,
  openLetter,
  refreshDueLetters,
  reschedule,
  saveDraftContent,
  sealLetter,
  statusCounts,
} from '@/services/storage/letters';
import { addYearsClamped } from '@/utils/date';

const future = (years = 1) => addYearsClamped(new Date(), years).toISOString();
const past = () => new Date(Date.now() - 86_400_000).toISOString();

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await db.letters.clear();
  await db.blobs.clear();
});

describe('状态机转换表', () => {
  it('DRAFT 只能进入 SEALED 或 CANCELLED', () => {
    expect(canTransition('DRAFT', 'SEALED')).toBe(true);
    expect(canTransition('DRAFT', 'CANCELLED')).toBe(true);
    expect(canTransition('DRAFT', 'OPENED')).toBe(false);
    expect(canTransition('DRAFT', 'READY')).toBe(false);
  });

  it('SEALED 只能进入 READY 或 CANCELLED', () => {
    expect(canTransition('SEALED', 'READY')).toBe(true);
    expect(canTransition('SEALED', 'CANCELLED')).toBe(true);
    expect(canTransition('SEALED', 'SEALED')).toBe(false);
  });

  it('READY 只能进入 OPENED 或 CANCELLED', () => {
    expect(canTransition('READY', 'OPENED')).toBe(true);
    expect(canTransition('READY', 'CANCELLED')).toBe(true);
  });

  it('OPENED / CANCELLED 是终态', () => {
    expect(canTransition('OPENED', 'DRAFT')).toBe(false);
    expect(canTransition('OPENED', 'SEALED')).toBe(false);
    expect(canTransition('CANCELLED', 'SEALED')).toBe(false);
  });
});

describe('信件创建与编号', () => {
  it('generateSerial 使用创建年份并带前缀', () => {
    const serial = generateSerial('2031-05-01T00:00:00.000Z');
    expect(serial).toMatch(/^FM-2031-[0-9A-Z]{4}$/);
  });

  it('newId 生成唯一 id', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newId()));
    expect(ids.size).toBe(50);
  });

  it('draftLetter 默认状态为 DRAFT 且 version 正确', () => {
    const letter = draftLetter({
      title: '致未来的我',
      recipient: '未来的我',
      content: '你好',
      scheduledOpenAt: future(5),
    });
    expect(letter.status).toBe('DRAFT');
    expect(letter.version).toBe(DATA_VERSION);
    expect(letter.privacy).toBe('private');
    expect(letter.replies).toEqual([]);
    expect(letter.starred).toBe(false);
  });
});

describe('封存流程', () => {
  it('封存后状态为 SEALED，并记录 sealedAt', async () => {
    const letter = draftLetter({
      title: '五年后',
      recipient: '未来的我',
      content: '内容',
      scheduledOpenAt: future(5),
    });
    await insertLetter(letter);

    const sealed = await sealLetter(letter.id, future(5));
    expect(sealed.status).toBe('SEALED');
    expect(sealed.sealedAt).toBeTruthy();

    const stored = await getLetter(letter.id);
    expect(stored?.status).toBe('SEALED');
  });

  it('拒绝把开启日期设为过去', async () => {
    const letter = draftLetter({
      title: 'x',
      recipient: 'me',
      content: 'y',
      scheduledOpenAt: future(1),
    });
    await insertLetter(letter);
    await expect(sealLetter(letter.id, past())).rejects.toThrow('开启日期必须在未来');
  });

  it('拒绝封存空信件（无正文且无附件）', async () => {
    const letter = draftLetter({
      title: 'empty',
      recipient: 'me',
      content: '   ',
      scheduledOpenAt: future(1),
    });
    await insertLetter(letter);
    await expect(sealLetter(letter.id, future(1))).rejects.toThrow('信件内容为空');
  });

  it('封存后正文不可修改', async () => {
    const letter = draftLetter({
      title: 't',
      recipient: 'me',
      content: 'c',
      scheduledOpenAt: future(1),
    });
    await insertLetter(letter);
    await sealLetter(letter.id, future(1));
    await expect(saveDraftContent(letter.id, { content: 'hacked' })).rejects.toThrow(
      '信件已封存',
    );
  });

  it('重复封存抛出状态转换错误', async () => {
    const letter = draftLetter({
      title: 't',
      recipient: 'me',
      content: 'c',
      scheduledOpenAt: future(1),
    });
    await insertLetter(letter);
    await sealLetter(letter.id, future(1));
    await expect(sealLetter(letter.id, future(2))).rejects.toThrow();
  });
});

describe('到期与开启', () => {
  it('refreshDueLetters 把到期的 SEALED 转为 READY', async () => {
    const letter = draftLetter({
      title: 'due',
      recipient: 'me',
      content: 'c',
      scheduledOpenAt: future(1),
    });
    await insertLetter(letter);
    await sealLetter(letter.id, future(1));
    // 直接把开启时间改到过去模拟到期（绕过 UI 层校验，测试领域逻辑）
    await db.letters.update(letter.id, { scheduledOpenAt: past() });

    const count = await refreshDueLetters();
    expect(count).toBe(1);
    expect((await getLetter(letter.id))?.status).toBe('READY');
  });

  it('未到期的信件不会被提前转为 READY', async () => {
    const letter = draftLetter({
      title: 'later',
      recipient: 'me',
      content: 'c',
      scheduledOpenAt: future(3),
    });
    await insertLetter(letter);
    await sealLetter(letter.id, future(3));
    const count = await refreshDueLetters();
    expect(count).toBe(0);
    expect((await getLetter(letter.id))?.status).toBe('SEALED');
  });

  it('未到到期时间时 openLetter 被拒绝', async () => {
    const letter = draftLetter({
      title: 'locked',
      recipient: 'me',
      content: 'c',
      scheduledOpenAt: future(2),
    });
    await insertLetter(letter);
    await sealLetter(letter.id, future(2));
    await expect(openLetter(letter.id)).rejects.toThrow();
  });

  it('已到期的 SEALED 可以直接开启', async () => {
    const letter = draftLetter({
      title: 'ok',
      recipient: 'me',
      content: 'c',
      scheduledOpenAt: future(1),
    });
    await insertLetter(letter);
    await sealLetter(letter.id, future(1));
    await db.letters.update(letter.id, { scheduledOpenAt: past() });

    const opened = await openLetter(letter.id);
    expect(opened.status).toBe('OPENED');
    expect(opened.openedAt).toBeTruthy();
  });

  it('earlyOpen 允许提前开启并记录 openedAt', async () => {
    const letter = draftLetter({
      title: 'early',
      recipient: 'me',
      content: 'c',
      scheduledOpenAt: future(10),
    });
    await insertLetter(letter);
    await sealLetter(letter.id, future(10));
    const opened = await earlyOpen(letter.id);
    expect(opened.status).toBe('OPENED');
  });

  it('草稿不能直接 openLetter', async () => {
    const letter = draftLetter({
      title: 'draft',
      recipient: 'me',
      content: 'c',
      scheduledOpenAt: future(1),
    });
    await insertLetter(letter);
    await expect(openLetter(letter.id)).rejects.toThrow();
  });
});

describe('取消与改期', () => {
  it('可以取消已封存信件', async () => {
    const letter = draftLetter({
      title: 'c',
      recipient: 'me',
      content: 'x',
      scheduledOpenAt: future(1),
    });
    await insertLetter(letter);
    await sealLetter(letter.id, future(1));
    await cancelLetter(letter.id);
    expect((await getLetter(letter.id))?.status).toBe('CANCELLED');
  });

  it('已开启的信件不能取消', async () => {
    const letter = draftLetter({
      title: 'c',
      recipient: 'me',
      content: 'x',
      scheduledOpenAt: future(1),
    });
    await insertLetter(letter);
    await sealLetter(letter.id, future(1));
    await db.letters.update(letter.id, { scheduledOpenAt: past() });
    await openLetter(letter.id);
    await expect(cancelLetter(letter.id)).rejects.toThrow();
  });

  it('可以给已封存信件改期', async () => {
    const letter = draftLetter({
      title: 'c',
      recipient: 'me',
      content: 'x',
      scheduledOpenAt: future(1),
    });
    await insertLetter(letter);
    await sealLetter(letter.id, future(1));
    const next = future(3);
    await reschedule(letter.id, next);
    const stored = await getLetter(letter.id);
    expect(stored?.scheduledOpenAt).toBe(next);
  });

  it('改期到过去被拒绝', async () => {
    const letter = draftLetter({
      title: 'c',
      recipient: 'me',
      content: 'x',
      scheduledOpenAt: future(1),
    });
    await insertLetter(letter);
    await sealLetter(letter.id, future(1));
    await expect(reschedule(letter.id, past())).rejects.toThrow('开启日期必须在未来');
  });
});

describe('回信链', () => {
  it('创建回信会更新原信件的 replies', async () => {
    const parent = draftLetter({
      title: 'parent',
      recipient: 'me',
      content: 'content',
      scheduledOpenAt: future(1),
    });
    await insertLetter(parent);
    await sealLetter(parent.id, future(1));
    await db.letters.update(parent.id, { scheduledOpenAt: past() });
    await openLetter(parent.id);

    const reply = draftLetter({
      title: 'reply',
      recipient: 'me',
      content: 'reply content',
      scheduledOpenAt: future(4),
      replyTo: parent.id,
    });
    await insertLetter(reply);

    const stored = await getLetter(parent.id);
    expect(stored?.replies).toContain(reply.id);
  });

  it('删除回信会从原信件 replies 中移除', async () => {
    const parent = draftLetter({
      title: 'p',
      recipient: 'me',
      content: 'c',
      scheduledOpenAt: future(1),
    });
    await insertLetter(parent);
    await sealLetter(parent.id, future(1));
    const reply = draftLetter({
      title: 'r',
      recipient: 'me',
      content: 'c',
      scheduledOpenAt: future(4),
      replyTo: parent.id,
    });
    await insertLetter(reply);

    await deleteLetter(reply.id);
    const stored = await getLetter(parent.id);
    expect(stored?.replies).not.toContain(reply.id);
  });
});

describe('删除与统计', () => {
  it('deleteLetter 同时删除附件 blob', async () => {
    const letter = draftLetter({
      title: 'with blob',
      recipient: 'me',
      content: 'c',
      scheduledOpenAt: future(1),
    });
    await insertLetter(letter);
    await db.blobs.put({
      key: 'blob-1',
      letterId: letter.id,
      mimeType: 'text/plain',
      name: 'a.txt',
      size: 3,
      data: new TextEncoder().encode('abc').buffer as ArrayBuffer,
      createdAt: new Date().toISOString(),
    });
    await db.letters.update(letter.id, {
      attachments: [
        {
          id: 'att-1',
          kind: 'text',
          name: 'a.txt',
          mimeType: 'text/plain',
          size: 3,
          blobKey: 'blob-1',
          createdAt: new Date().toISOString(),
        },
      ],
    });

    await deleteLetter(letter.id);
    expect(await getLetter(letter.id)).toBeUndefined();
    expect(await db.blobs.get('blob-1')).toBeUndefined();
  });

  it('statusCounts 统计各状态', async () => {
    const a = draftLetter({ title: 'a', recipient: 'm', content: 'c', scheduledOpenAt: future(1) });
    const b = draftLetter({ title: 'b', recipient: 'm', content: 'c', scheduledOpenAt: future(1) });
    await insertLetter(a);
    await insertLetter(b);
    await sealLetter(b.id, future(1));

    const letters = await listLetters();
    const counts = statusCounts(letters);
    expect(counts.ALL).toBe(2);
    expect(counts.DRAFT).toBe(1);
    expect(counts.SEALED).toBe(1);
  });
});
