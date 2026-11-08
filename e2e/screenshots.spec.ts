import { test } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

/**
 * 截图脚本：使用真实运行的构建产物，生成 README 所需的产品截图。
 * 会写入 docs/screenshots/。
 */

const OUT = path.resolve('docs/screenshots');
fs.mkdirSync(OUT, { recursive: true });

const SEED = [
  {
    id: 'shot-sealed-5y',
    serial: 'FM-2026-5Y01',
    title: '给五年后的自己',
    recipient: '未来的我',
    content:
      '# 你好，2031 年的我\n\n写这封信的时候，是 2026 年 11 月。\n\n- 你还在写东西吗\n- 你还在那个城市吗\n- 你有没有去过冰岛\n\n> 如果有些事没有做到，也不要紧。\n\n**当时你担心的很多事情，后来都没有发生。**',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    scheduledOpenAt: new Date(Date.now() + 86400000 * 365 * 5).toISOString(),
    sealedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    status: 'SEALED',
    kind: 'future-self',
    cover: 'night',
    tags: ['自己', '五年'],
    attachments: [],
    mood: {
      mood: 'hopeful',
      mostImportant: '把这件事做完',
      workingOn: '每天写五百字',
      biggestWorry: '时间过得太快',
      lookingForwardTo: '明年的旅行',
      city: '杭州',
      currentGoal: '完成第一个长期项目',
    },
    privacy: 'private',
    reminder: { enabled: true, daysBefore: 7 },
    replies: [],
    starred: false,
    origin: 'local',
    version: 1,
  },
  {
    id: 'shot-ready-1y',
    serial: 'FM-2025-1Y02',
    title: '一年前的今天',
    recipient: '未来的我',
    content:
      '# 一年前的今天\n\n今天的天气很普通，我在窗边坐了一下午。\n\n那时候我在想，一年后的自己会不会还记得这一天。\n\n现在看来，确实记得。',
    createdAt: new Date(Date.now() - 86400000 * 366).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 366).toISOString(),
    scheduledOpenAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    sealedAt: new Date(Date.now() - 86400000 * 366).toISOString(),
    status: 'READY',
    kind: 'future-self',
    cover: 'aurora',
    tags: ['日常'],
    attachments: [],
    mood: { mood: 'calm', city: '上海' },
    privacy: 'private',
    reminder: { enabled: true, daysBefore: 0 },
    replies: [],
    starred: true,
    origin: 'local',
    version: 1,
  },
  {
    id: 'shot-opened',
    serial: 'FM-2024-OP03',
    title: '写给刚毕业的自己',
    recipient: '二十四岁的我',
    content:
      '# 写给二十四岁的我\n\n你终于毕业了。\n\n- 那天你哭了吗\n- 你有没有后悔选这个专业\n\n我想告诉你：**那些看起来很漫长的日子，其实过得很快。**\n\n> 别急着证明什么，先好好睡一觉。',
    createdAt: new Date(Date.now() - 86400000 * 800).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    scheduledOpenAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    sealedAt: new Date(Date.now() - 86400000 * 800).toISOString(),
    openedAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    status: 'OPENED',
    kind: 'future-self',
    cover: 'ember',
    tags: ['毕业', '重要'],
    attachments: [],
    mood: { mood: 'grateful', city: '北京' },
    privacy: 'private',
    shareQuote: '别急着证明什么，先好好睡一觉。',
    reminder: { enabled: false, daysBefore: 0 },
    replies: [],
    starred: false,
    origin: 'local',
    version: 1,
  },
  {
    id: 'shot-draft',
    serial: 'FM-2026-DR04',
    title: '给未来的孩子',
    recipient: '未来的孩子',
    content: '如果你读到这封信，说明我已经等了很久。\n\n此刻的世界是这样的……',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 1800000).toISOString(),
    scheduledOpenAt: new Date(Date.now() + 86400000 * 365 * 10).toISOString(),
    status: 'DRAFT',
    kind: 'child',
    cover: 'sea',
    tags: ['孩子'],
    attachments: [],
    mood: {},
    privacy: 'private',
    reminder: { enabled: false, daysBefore: 0 },
    replies: [],
    starred: false,
    origin: 'local',
    version: 1,
  },
];

async function seed(page: import('@playwright/test').Page) {
  await page.goto('/#/compose');
  await page.getByPlaceholder('给五年后的自己').waitFor({ state: 'visible' });
  await page.evaluate(async (letters) => {
    const open = indexedDB.open('future-mail');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onerror = () => reject(open.error);
      open.onsuccess = () => resolve(open.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('letters', 'readwrite');
      for (const l of letters) tx.objectStore('letters').put(l);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, SEED);
  await page.reload();
  await page.getByRole('link', { name: /Future Mail/i }).first().waitFor({ state: 'visible' });
}

test.describe('产品截图', () => {
  test.use({ viewport: { width: 1440, height: 960 } });

  test('生成桌面端截图', async ({ page }) => {
    await seed(page);

    await page.goto('/#/');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, '01-home-desktop.png'), fullPage: false });

    await page.goto('/#/compose');
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, '02-compose.png'), fullPage: false });

    await page.goto('/#/archive');
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, '03-archive.png'), fullPage: false });

    await page.goto('/#/timeline');
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, '04-timeline.png'), fullPage: false });

    /* 日历视图 */
    await page.getByRole('tab', { name: '日历' }).click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, '05-calendar.png'), fullPage: false });

    await page.goto('/#/letter/shot-sealed-5y');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, '06-sealed-letter.png'), fullPage: false });

    await page.goto('/#/letter/shot-opened');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT, '07-opened-letter.png'), fullPage: false });

    await page.goto('/#/capsule');
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, '08-capsule-templates.png'), fullPage: false });

    await page.goto('/#/letter/shot-opened/share');
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT, '09-share-card.png'), fullPage: false });

    await page.goto('/#/settings');
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, '10-settings.png'), fullPage: false });

    /* 浅色主题 */
    await page.getByRole('button', { name: '浅色' }).click();
    await page.waitForTimeout(600);
    await page.goto('/#/');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, '11-home-light.png'), fullPage: false });

    /* 英文界面 */
    await page.goto('/#/settings');
    await page.getByRole('button', { name: 'English' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Dark' }).click();
    await page.goto('/#/');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, '12-home-en.png'), fullPage: false });
  });
});

test.describe('移动端截图', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test('生成移动端截图', async ({ page }) => {
    await seed(page);

    await page.goto('/#/');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, '13-home-mobile.png'), fullPage: false });

    await page.goto('/#/compose');
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, '14-compose-mobile.png'), fullPage: false });

    await page.goto('/#/archive');
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, '15-archive-mobile.png'), fullPage: false });

    await page.goto('/#/letter/shot-sealed-5y');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, '16-sealed-mobile.png'), fullPage: false });
  });
});
