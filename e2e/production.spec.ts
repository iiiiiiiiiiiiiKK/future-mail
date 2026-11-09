import { test, expect, type Page } from '@playwright/test';

/**
 * 生产环境验收测试 —— 直接针对已部署的线上地址执行。
 * 通过 PROD_URL 环境变量传入；默认使用 GitHub Pages 地址。
 */

const PROD = process.env.PROD_URL ?? 'https://iiiiiiiiiiiiikk.github.io/future-mail/';
const X_URL = 'https://x.com/0xkillcoin';

test.use({ baseURL: PROD });

async function seed(page: Page, letter: Record<string, unknown>) {
  await page.goto(`${PROD}#/compose`);
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
  }, letter);
  await page.reload();
  await expect(page.getByRole('link', { name: /Future Mail/i }).first()).toBeVisible();
}

test.describe('生产环境验收', () => {
  test('首页可访问且无控制台错误', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    const response = await page.goto(`${PROD}`);
    expect(response?.status()).toBe(200);

    await expect(page.getByText('A MESSAGE TO YOUR FUTURE SELF.').first()).toBeVisible();
    /* 作者 X 超链接 */
    await expect(page.locator(`a[href="${X_URL}"]`).first()).toBeVisible();
    expect(errors.filter((e) => !/favicon/i.test(e))).toEqual([]);
  });

  test('线上完整流程：写信 → 封存 → 档案 → 开启', async ({ page }) => {
    await page.goto(`${PROD}#/compose`);

    await page.getByPlaceholder('给五年后的自己').fill('线上验收信件');
    await page.locator('textarea').first().fill('# 线上验收\n\n这段内容用于验证真实部署。');
    await page.getByRole('button', { name: '1 年后' }).click();
    await expect(page.getByText(/已自动保存/)).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: '封存', exact: true }).first().click();
    await page.getByRole('button', { name: '确认封存' }).click();
    await expect(page).toHaveURL(/\/letter\//, { timeout: 20_000 });
    await expect(page.getByText('已封存').first()).toBeVisible();

    await page.goto(`${PROD}#/archive`);
    await expect(page.getByText('线上验收信件').first()).toBeVisible();
  });

  test('线上到期信件可解封并回信', async ({ page }) => {
    const now = Date.now();
    await seed(page, {
      id: 'prod-ready-1',
      serial: 'FM-2025-PRD1',
      title: '线上到期信件',
      recipient: '未来的我',
      content: '线上正文可见性验证。',
      createdAt: new Date(now - 86_400_000 * 400).toISOString(),
      updatedAt: new Date(now - 86_400_000 * 400).toISOString(),
      scheduledOpenAt: new Date(now - 86_400_000 * 5).toISOString(),
      sealedAt: new Date(now - 86_400_000 * 400).toISOString(),
      status: 'READY',
      kind: 'future-self',
      cover: 'aurora',
      tags: [],
      attachments: [],
      mood: {},
      privacy: 'private',
      reminder: { enabled: false, daysBefore: 0 },
      replies: [],
      starred: false,
      origin: 'local',
      version: 1,
    });

    await page.goto(`${PROD}#/letter/prod-ready-1`);
    await expect(page.getByText('线上正文可见性验证')).toHaveCount(0);

    await page.getByRole('button', { name: '打开信件' }).first().click();
    await page.getByRole('button', { name: '打开信件' }).last().click();
    await expect(page.getByText('线上正文可见性验证')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/相隔了 \d+ 天/)).toBeVisible();

    await page.getByRole('button', { name: '写回信' }).click();
    await expect(page).toHaveURL(/compose\?replyTo=/);
  });

  test('线上分享卡片生成 PNG 且不含正文', async ({ page }) => {
    const now = Date.now();
    await seed(page, {
      id: 'prod-opened-1',
      serial: 'FM-2024-PRD2',
      title: '线上分享测试',
      recipient: '未来的我',
      content: '这段正文不得出现在分享卡片上。',
      createdAt: new Date(now - 86_400_000 * 500).toISOString(),
      updatedAt: new Date(now).toISOString(),
      scheduledOpenAt: new Date(now - 86_400_000).toISOString(),
      sealedAt: new Date(now - 86_400_000 * 500).toISOString(),
      openedAt: new Date(now).toISOString(),
      status: 'OPENED',
      kind: 'future-self',
      cover: 'ember',
      tags: [],
      attachments: [],
      mood: {},
      privacy: 'private',
      reminder: { enabled: false, daysBefore: 0 },
      replies: [],
      starred: false,
      origin: 'local',
      version: 1,
    });

    await page.goto(`${PROD}#/letter/prod-opened-1/share`);
    await expect(page.locator('img[alt="卡片预览"]')).toBeVisible({ timeout: 30_000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByRole('button', { name: '下载 PNG' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.png$/);

    await expect(page.getByText('这段正文不得出现在分享卡片上')).toHaveCount(0);
  });

  test('线上导出与导入往返', async ({ page }) => {
    await page.goto(`${PROD}#/compose`);
    await page.getByPlaceholder('给五年后的自己').fill('线上导出测试');
    await page.locator('textarea').first().fill('线上导入导出往返验证。');
    await expect(page.getByText(/已自动保存/)).toBeVisible({ timeout: 20_000 });

    await page.goto(`${PROD}#/settings`);
    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByRole('button', { name: '导出信件（不含附件）' }).click();
    const path = await (await downloadPromise).path();
    expect(path).toBeTruthy();

    await page.getByRole('button', { name: '删除全部本地数据' }).click();
    await page.getByRole('button', { name: /我已备份/ }).click();
    await expect(page.getByText('全部本地数据已删除')).toBeVisible({ timeout: 20_000 });

    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '导入数据（JSON）' }).click();
    await (await chooserPromise).setFiles(path!);
    await expect(page.getByText(/导入完成/)).toBeVisible({ timeout: 25_000 });

    await page.goto(`${PROD}#/archive`);
    await expect(page.getByText('线上导出测试').first()).toBeVisible();
  });

  test('线上语言与主题切换', async ({ page }) => {
    await page.goto(`${PROD}#/settings`);
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.getByRole('button', { name: 'Light' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await page.getByRole('button', { name: '中文' }).click();
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
    await page.getByRole('button', { name: '深色' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });
});

test.describe('生产环境移动端', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('iPhone 视口布局与作者 X 链接', async ({ page }) => {
    const response = await page.goto(`${PROD}`);
    expect(response?.status()).toBe(200);

    /* 顶部 X 图标链接可见 */
    await expect(page.getByRole('link', { name: /0xkillcoin/ }).first()).toBeVisible();

    /* 移动端底部导航存在且可点击 */
    await page.getByRole('link', { name: '我的档案' }).last().click();
    await expect(page).toHaveURL(/archive/);

    /* 无横向溢出 */
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    /* 底部导航不遮挡主内容（存在且固定） */
    await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeVisible();
  });

  test('移动端写信可用', async ({ page }) => {
    await page.goto(`${PROD}#/compose`);
    await page.getByPlaceholder('给五年后的自己').fill('移动端验收');
    await page.locator('textarea').first().fill('在手机视口下写入内容。');
    await expect(page.getByText(/已自动保存/)).toBeVisible({ timeout: 20_000 });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('移动端附件上传真实写入本地存储', async ({ page }) => {
    await page.goto(`${PROD}#/compose`);
    await page.getByPlaceholder('给五年后的自己').fill('线上附件验收');

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
      'base64',
    );
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({ name: 'prod.png', mimeType: 'image/png', buffer: png });

    /* 附件出现在列表里（说明读取真实成功，而不是报错） */
    await expect(page.getByText('prod.png')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/附件读取失败/)).toHaveCount(0);

    /* IndexedDB 里确实有一条 blob 记录（WebKit 修复的回归检查） */
    const stored = await page.evaluate(async () => {
      const open = indexedDB.open('future-mail');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        open.onerror = () => reject(open.error);
        open.onsuccess = () => resolve(open.result);
      });
      const count = await new Promise<number>((resolve) => {
        const tx = db.transaction('blobs', 'readonly');
        const req = tx.objectStore('blobs').count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(-1);
      });
      db.close();
      return count;
    });
    expect(stored).toBeGreaterThanOrEqual(1);
  });

  test('线上站内提醒窗口生效', async ({ page }) => {
    const now = Date.now();
    await seed(page, {
      id: 'prod-reminder-1',
      serial: 'FM-2026-PRD3',
      title: '线上提醒窗口信件',
      recipient: '未来的我',
      content: '线上提醒验证。',
      createdAt: new Date(now - 86400000).toISOString(),
      updatedAt: new Date(now - 86400000).toISOString(),
      /* 2 天后开启 + 提前 7 天提醒 → 处于窗口内 */
      scheduledOpenAt: new Date(now + 86400000 * 2).toISOString(),
      sealedAt: new Date(now - 86400000).toISOString(),
      status: 'SEALED',
      kind: 'future-self',
      cover: 'night',
      tags: [],
      attachments: [],
      mood: {},
      privacy: 'private',
      reminder: { enabled: true, daysBefore: 7 },
      replies: [],
      starred: false,
      origin: 'local',
      version: 2,
    });

    await page.goto(`${PROD}#/`);
    await expect(page.getByText('即将开启的提醒')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('线上提醒窗口信件').first()).toBeVisible();
    await expect(page.getByText(/还有 \d+ 天/)).toBeVisible();
  });
});
