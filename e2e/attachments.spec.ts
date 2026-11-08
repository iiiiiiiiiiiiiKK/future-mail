import { test, expect } from '@playwright/test';

/**
 * 附件流程验证：上传（真实 File）→ 写入 IndexedDB → 显示 → 移除 → 拒绝非法类型。
 */

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);

test('上传图片附件并在封存后展示', async ({ page }) => {
  await page.goto('/#/compose');
  await expect(page.getByPlaceholder('给五年后的自己')).toBeVisible();

  await page.getByPlaceholder('给五年后的自己').fill('带附件的信');
  await page.locator('textarea').first().fill('这封信有一张图片附件。');

  /* 通过隐藏 input 上传真实 PNG 文件 */
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG_1x1 });

  /* 附件出现在列表中 */
  await expect(page.getByText('photo.png')).toBeVisible({ timeout: 15_000 });

  /* 自动保存后封存 */
  await expect(page.getByText(/已自动保存/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '封存', exact: true }).first().click();
  await page.getByRole('button', { name: '确认封存' }).click();
  await expect(page).toHaveURL(/\/letter\//, { timeout: 20_000 });

  /* 开启后附件仍可读取（真实 blob 已在 IndexedDB 中） */
  await page.evaluate(async () => {
    const open = indexedDB.open('future-mail');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onerror = () => reject(open.error);
      open.onsuccess = () => resolve(open.result);
    });
    const blobCount = await new Promise<number>((resolve) => {
      const tx = db.transaction('blobs', 'readonly');
      const req = tx.objectStore('blobs').count();
      req.onsuccess = () => resolve(req.result);
    });
    db.close();
    if (blobCount < 1) throw new Error('附件未写入 IndexedDB');
  });
});

test('移除附件后列表中消失', async ({ page }) => {
  await page.goto('/#/compose');
  await page.getByPlaceholder('给五年后的自己').fill('移除附件测试');

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });
  await expect(page.getByText('note.txt')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: '移除' }).first().click();
  await expect(page.getByText('note.txt')).toHaveCount(0, { timeout: 10_000 });
});

test('拒绝不支持的文件类型并给出明确提示', async ({ page }) => {
  await page.goto('/#/compose');
  await expect(page.getByPlaceholder('给五年后的自己')).toBeVisible();

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles({
    name: 'evil.exe',
    mimeType: 'application/x-msdownload',
    buffer: Buffer.from('MZ'),
  });

  /* 明确错误提示，且不加入列表 */
  await expect(page.getByText(/不支持的文件类型/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('evil.exe')).toHaveCount(0);
});
