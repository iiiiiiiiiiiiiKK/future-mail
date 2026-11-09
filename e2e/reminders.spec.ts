import { test, expect } from '@playwright/test';

/**
 * 提醒功能验证：
 *  - 自定义提醒天数可保存
 *  - 提醒窗口内的信件在首页以站内提醒形式出现
 */

const SEED_REMINDER_LETTER = {
  id: 'reminder-window-1',
  serial: 'FM-2026-REM1',
  title: '提醒窗口内的信',
  recipient: '未来的我',
  content: '这封信处于提醒窗口内。',
  createdAt: new Date(Date.now() - 86400000).toISOString(),
  updatedAt: new Date(Date.now() - 86400000).toISOString(),
  /* 2 天后开启，且设置了「提前 7 天」提醒 → 处于提醒窗口内 */
  scheduledOpenAt: new Date(Date.now() + 86400000 * 2).toISOString(),
  sealedAt: new Date(Date.now() - 86400000).toISOString(),
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
};

const SEED_OUTSIDE_WINDOW = {
  ...SEED_REMINDER_LETTER,
  id: 'reminder-outside-1',
  serial: 'FM-2026-REM2',
  title: '不在提醒窗口的信',
  /* 100 天后开启，reminder.daysBefore = 7 → 不在窗口内 */
  scheduledOpenAt: new Date(Date.now() + 86400000 * 100).toISOString(),
};

async function seed(page: import('@playwright/test').Page, letters: unknown[]) {
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
      for (const l of payload as Array<Record<string, unknown>>) tx.objectStore('letters').put(l);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, letters);
  await page.reload();
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Future Mail/i }).first()).toBeVisible();
}

test('提醒窗口内的信件在首页显示站内提醒', async ({ page }) => {
  await seed(page, [SEED_REMINDER_LETTER, SEED_OUTSIDE_WINDOW]);

  /* 窗口内的信会出现 */
  await expect(page.getByText('即将开启的提醒')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('提醒窗口内的信').first()).toBeVisible();

  /* 包含剩余天数 */
  await expect(page.getByText(/还有 \d+ 天/)).toBeVisible();

  /* 不在窗口内的信不会出现在提醒区 */
  const reminderSection = page.locator('section', { hasText: '即将开启的提醒' });
  await expect(reminderSection.getByText('不在提醒窗口的信')).toHaveCount(0);
});

test('自定义提醒天数可以设置并保存', async ({ page }) => {
  await page.goto('/#/compose');
  await expect(page.getByPlaceholder('给五年后的自己')).toBeVisible();

  await page.getByPlaceholder('给五年后的自己').fill('自定义提醒测试');
  await page.getByRole('button', { name: '自定义天数' }).click();

  const input = page.locator('#custom-reminder-days');
  await expect(input).toBeVisible();
  await input.fill('14');

  await expect(page.getByText(/已自动保存/)).toBeVisible({ timeout: 15_000 });

  /* 重新加载后仍然是 14 天 */
  await page.reload();
  await expect(page.getByPlaceholder('给五年后的自己')).toHaveValue('自定义提醒测试');
  await expect(page.locator('#custom-reminder-days')).toHaveValue('14');

  /* 数据里确实是 daysBefore: 14 */
  const days = await page.evaluate(async () => {
    const open = indexedDB.open('future-mail');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onerror = () => reject(open.error);
      open.onsuccess = () => resolve(open.result);
    });
    /* 原生 IDBObjectStore 用 getAll（toArray 是 Dexie 的 API） */
    const rows = await new Promise<Array<Record<string, unknown>>>((resolve) => {
      const tx = db.transaction('letters', 'readonly');
      const req = tx.objectStore('letters').getAll();
      req.onsuccess = () => resolve(req.result as Array<Record<string, unknown>>);
      req.onerror = () => resolve([]);
    });
    db.close();
    const target = rows.find((r) => r.title === '自定义提醒测试');
    return (target?.reminder as { daysBefore?: number } | undefined)?.daysBefore ?? -1;
  });
  expect(days).toBe(14);
});

test('未开启提醒或不在窗口内均不显示提醒', async ({ page }) => {
  /* 三天后开启但没开提醒 */
  const noReminder = {
    ...SEED_REMINDER_LETTER,
    id: 'reminder-disabled-1',
    serial: 'FM-2026-REM3',
    title: '未开启提醒的信',
    scheduledOpenAt: new Date(Date.now() + 86400000 * 3).toISOString(),
    reminder: { enabled: false, daysBefore: 0 },
  };

  await seed(page, [noReminder]);

  /* 窗口外的信也不应出现 */
  await seed(page, [noReminder, SEED_OUTSIDE_WINDOW]);

  await expect(page.getByText('即将开启的提醒')).toHaveCount(0);
  await expect(page.getByText('未开启提醒的信').first()).toBeVisible();
});
