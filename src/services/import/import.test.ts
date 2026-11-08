import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '@/services/storage/db';
import { importBundle, parseBundle, ImportError } from '@/services/import/import';
import { letterToMarkdown, exportAllJson } from '@/services/export/export';
import { draftLetter, insertLetter, listLetters } from '@/services/storage/letters';
import { DATA_VERSION } from '@/types';
import { addYearsClamped } from '@/utils/date';

const future = (y = 1) => addYearsClamped(new Date(), y).toISOString();

beforeEach(async () => {
  if (!db.isOpen()) await db.open();
  await db.letters.clear();
  await db.blobs.clear();
});

describe('parseBundle 结构校验', () => {
  it('拒绝非法 JSON', () => {
    expect(() => parseBundle('{oops')).toThrow(ImportError);
  });

  it('拒绝非 Future Mail 备份', () => {
    expect(() => parseBundle(JSON.stringify({ app: 'other', version: 1, letters: [] }))).toThrow(
      '不是 Future Mail 备份文件',
    );
  });

  it('拒绝版本过新的备份', () => {
    expect(() =>
      parseBundle(JSON.stringify({ app: 'future-mail', version: DATA_VERSION + 1, letters: [] })),
    ).toThrow('版本过新');
  });

  it('拒绝缺少 letters 数组', () => {
    expect(() =>
      parseBundle(JSON.stringify({ app: 'future-mail', version: 1 })),
    ).toThrow('缺少 letters 数组');
  });

  it('接受合法备份', () => {
    const bundle = parseBundle(
      JSON.stringify({ app: 'future-mail', version: 1, letters: [], exportedAt: '2026-01-01' }),
    );
    expect(bundle.app).toBe('future-mail');
    expect(bundle.letters).toEqual([]);
  });
});

describe('importBundle', () => {
  it('导入合法信件', async () => {
    const result = await importBundle({
      app: 'future-mail',
      version: 1,
      exportedAt: new Date().toISOString(),
      letters: [
        {
          ...draftLetter({ title: '导入', recipient: 'me', content: 'hi', scheduledOpenAt: future(1) }),
        },
      ],
    });
    expect(result.imported).toBe(1);
    expect(result.invalid).toBe(0);
    const stored = await listLetters();
    expect(stored[0].origin).toBe('imported');
  });

  it('跳过已存在 ID，不覆盖现有数据', async () => {
    const letter = draftLetter({
      title: 'original',
      recipient: 'me',
      content: 'v1',
      scheduledOpenAt: future(1),
    });
    await insertLetter(letter);

    const result = await importBundle({
      app: 'future-mail',
      version: 1,
      exportedAt: new Date().toISOString(),
      letters: [{ ...letter, title: 'overwritten' }],
    });

    expect(result.skipped).toBe(1);
    const stored = await listLetters();
    expect(stored[0].title).toBe('original');
  });

  it('overwrite: true 时允许覆盖', async () => {
    const letter = draftLetter({
      title: 'original',
      recipient: 'me',
      content: 'v1',
      scheduledOpenAt: future(1),
    });
    await insertLetter(letter);

    await importBundle(
      {
        app: 'future-mail',
        version: 1,
        exportedAt: new Date().toISOString(),
        letters: [{ ...letter, title: 'replaced' }],
      },
      { overwrite: true },
    );

    const stored = await listLetters();
    expect(stored[0].title).toBe('replaced');
  });

  it('统计文件内重复 ID', async () => {
    const base = draftLetter({
      title: 'dup',
      recipient: 'me',
      content: 'c',
      scheduledOpenAt: future(1),
    });
    const result = await importBundle({
      app: 'future-mail',
      version: 1,
      exportedAt: new Date().toISOString(),
      letters: [base, { ...base }],
    });
    expect(result.imported).toBe(1);
    expect(result.duplicated).toBe(1);
  });

  it('标记无效条目并继续处理其他条目', async () => {
    const good = draftLetter({
      title: 'good',
      recipient: 'me',
      content: 'c',
      scheduledOpenAt: future(1),
    });
    const result = await importBundle({
      app: 'future-mail',
      version: 1,
      exportedAt: new Date().toISOString(),
      letters: [good, { title: 'no schedule' } as never],
    });
    expect(result.imported).toBe(1);
    expect(result.invalid).toBe(1);
    expect(result.errors.length).toBe(1);
  });

  it('导入 base64 附件', async () => {
    const letter = draftLetter({
      title: 'blob',
      recipient: 'me',
      content: 'c',
      scheduledOpenAt: future(1),
    });
    const base64 = btoa('hello');
    await importBundle({
      app: 'future-mail',
      version: 1,
      exportedAt: new Date().toISOString(),
      letters: [letter],
      blobs: [
        {
          key: 'k1',
          letterId: letter.id,
          mimeType: 'text/plain',
          name: 'a.txt',
          size: 5,
          base64,
        },
      ],
    });
    const blob = await db.blobs.get('k1');
    expect(blob).toBeTruthy();
    expect(blob?.name).toBe('a.txt');
  });
});

describe('导出', () => {
  it('exportAllJson 生成可再次解析的 bundle', async () => {
    const letter = draftLetter({
      title: '导出测试',
      recipient: 'me',
      content: '# 标题\n正文',
      scheduledOpenAt: future(2),
    });
    await insertLetter(letter);

    const blob = await exportAllJson(false);
    const text = await blob.text();
    const parsed = parseBundle(text);
    expect(parsed.letters).toHaveLength(1);
    expect(parsed.letters[0].title).toBe('导出测试');
  });

  it('letterToMarkdown 含元信息与正文', () => {
    const letter = draftLetter({
      title: '标题 A',
      recipient: '未来的我',
      content: '正文内容',
      scheduledOpenAt: future(1),
    });
    const md = letterToMarkdown({ ...letter, status: 'OPENED', openedAt: new Date().toISOString() }, 'zh');
    expect(md).toContain('# 标题 A');
    expect(md).toContain('正文内容');
    expect(md).toContain(letter.serial);
    expect(md).toContain('未来的我');
    expect(md).toContain('x.com/0xkillcoin');
  });
});
