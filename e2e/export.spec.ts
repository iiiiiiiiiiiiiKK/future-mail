import { test, expect } from '@playwright/test';

/**
 * 导出功能验证：Markdown / PDF / JSON。
 * PDF 通过监听 download 事件验证真的产出了文件（而不是只弹了个提示）。
 */

const SEED = {
  id: 'export-check-1',
  serial: 'FM-2024-EXP1',
  title: '导出验证信件',
  recipient: '未来的我',
  content:
    '# 导出验证\n\n这是一段正文，包含中文与 English mixed text.\n\n- 第一条\n- 第二条\n\n> 引用一行。',
  createdAt: new Date(Date.now() - 86400000 * 100).toISOString(),
  updatedAt: new Date(Date.now() - 86400000 * 100).toISOString(),
  scheduledOpenAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  sealedAt: new Date(Date.now() - 86400000 * 100).toISOString(),
  openedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  status: 'OPENED',
  kind: 'future-self',
  cover: 'night',
  tags: ['导出'],
  attachments: [],
  mood: { mood: 'calm' },
  privacy: 'private',
  reminder: { enabled: false, daysBefore: 0 },
  replies: [],
  starred: false,
  origin: 'local',
  version: 1,
};

test.beforeEach(async ({ page }) => {
  await page.goto('/#/compose');
  await expect(page.getByPlaceholder('给五年后的自己')).toBeVisible();
  await page.evaluate(async (payload) => {
    const open = indexedDB.open('future-mail');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onerror = () => reject(open.error);
      open.onsuccess = () => resolve(open.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('letters', 'readwrite');
      tx.objectStore('letters').put(payload);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, SEED);
  await page.reload();
  await page.goto(`/#/letter/${SEED.id}`);
  await expect(page.getByText(SEED.title).first()).toBeVisible();
});

test('Markdown 导出产生 .md 文件', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download', { timeout: 20_000 });
  await page.getByRole('button', { name: '导出 Markdown' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.md$/);

  const path = await download.path();
  expect(path).toBeTruthy();
});

test('PDF 导出产生 .pdf 文件', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download', { timeout: 40_000 });
  await page.getByRole('button', { name: '导出 PDF' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);

  const path = await download.path();
  expect(path).toBeTruthy();
});
