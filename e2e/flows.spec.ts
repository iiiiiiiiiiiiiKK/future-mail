import { test, expect, type Page } from '@playwright/test';

/**
 * 关键流程端到端测试 —— 全部在真实浏览器中执行，使用真实 IndexedDB。
 * 覆盖：写信 → 封存 → 档案 → 时间轴 → 到期开启 → 回信 → 导出/导入 → 分享卡片 → 移动端适配。
 */

const X_URL = 'https://x.com/0xkillcoin';

async function seedLetter(page: Page, letter: Record<string, unknown>) {
  /* 先进入写信页：应用会打开 IndexedDB 并创建对象仓库，避免 store 尚不存在 */
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
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, letter);

  /* 关键：仅改 hash 的 goto 属于同文档导航，不会触发重新加载，
     应用内存中的 letters 快照仍是旧的。必须真正 reload 才能读到新数据。 */
  await page.reload();
  await expect(page.getByRole('link', { name: /Future Mail/i }).first()).toBeVisible();
}

test.describe('首页与导航', () => {
  test('展示品牌、标语与作者 X 链接', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('A MESSAGE TO YOUR FUTURE SELF.').first()).toBeVisible();

    /* 作者 X 超链接必须存在且指向正确地址 */
    const xLinks = page.locator(`a[href="${X_URL}"]`);
    expect(await xLinks.count()).toBeGreaterThan(0);
    await expect(xLinks.first()).toBeVisible();
  });

  test('X 链接在移动端菜单中也存在', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.reload();
    await page.getByRole('button', { name: '菜单' }).click();
    /* 菜单展开后应至少有一个可见的 X 链接 */
    const visible = page.locator(`a[href="${X_URL}"]:visible`);
    await expect(visible.first()).toBeVisible();
  });

  test('主导航可跳转', async ({ page }) => {
    await page.goto('/');

    /* 桌面端为顶部导航，移动端为底部 sticky 导航：分别验证 */
    const mobileNav = page.getByRole('navigation', { name: 'Mobile' });
    const useMobileNav = await mobileNav.isVisible();

    if (useMobileNav) {
      const archiveInNav = mobileNav.getByRole('link', { name: '我的档案' });
      await expect(archiveInNav).toHaveAttribute('href', '#/archive');
      /* 底部导航是 sticky 元素；应用初始化（读取 IndexedDB）后可能重排一次，
         因此对「点击 → 导航」做一次有限重试，而不是断言必须一次命中。 */
      await expect(async () => {
        await archiveInNav.click();
        await expect(page).toHaveURL(/#\/archive/, { timeout: 3_000 });
      }).toPass({ timeout: 20_000 });
    } else {
      await page.getByRole('link', { name: '我的档案' }).first().click();
      await expect(page).toHaveURL(/archive/);
    }

    /* 时间轴同样可达 */
    await page.goto('/#/');
    if (useMobileNav) {
      await expect(async () => {
        await mobileNav.getByRole('link', { name: '时间轴' }).click();
        await expect(page).toHaveURL(/#\/timeline/, { timeout: 3_000 });
      }).toPass({ timeout: 20_000 });
    } else {
      await page.getByRole('link', { name: '时间轴' }).first().click();
      await expect(page).toHaveURL(/timeline/);
    }
  });
});

test.describe('写信与封存完整流程', () => {
  test('创建草稿 → 自动保存 → 封存 → 档案可见', async ({ page }) => {
    await page.goto('/#/compose');

    const title = page.getByPlaceholder('给五年后的自己');
    await expect(title).toBeVisible();
    await title.fill('致五年后的我');

    const recipient = page.getByPlaceholder('未来的我').first();
    await recipient.fill('我自己');

    const body = page.locator('textarea').first();
    await body.fill(
      '# 你好\n\n这是 **2026** 年的我写给 2031 年的自己。\n\n- 希望你还在写作\n- 希望你身体健康',
    );

    await page.getByRole('button', { name: '5 年后' }).click();

    /* 等待自动保存 */
    await expect(page.getByText(/已自动保存/)).toBeVisible({ timeout: 15_000 });

    /* 封存 */
    await page.getByRole('button', { name: '封存', exact: true }).first().click();
    await expect(page.getByText('确认封存这封信？')).toBeVisible();
    await page.getByRole('button', { name: '确认封存' }).click();

    /* 跳转到信件详情，显示 SEALED */
    await expect(page).toHaveURL(/\/letter\//, { timeout: 15_000 });
    await expect(page.getByText('已封存').first()).toBeVisible();
    await expect(page.getByText(/FM-\d{4}-[0-9A-Z]{4}/).first()).toBeVisible();

    /* 档案中出现该信件，且为已封存页签 */
    await page.goto('/#/archive');
    await expect(page.getByText('致五年后的我').first()).toBeVisible();
    await page.getByRole('tab', { name: /已封存/ }).click();
    await expect(page.getByText('致五年后的我').first()).toBeVisible();
  });

  test('拒绝过去日期', async ({ page }) => {
    await page.goto('/#/compose');
    const input = page.locator('input[type="datetime-local"]');
    await input.fill('2020-01-01T12:00');
    await expect(page.getByText('请选择晚于当前时间的开启日期')).toBeVisible();
  });

  test('草稿可继续编辑', async ({ page }) => {
    await page.goto('/#/compose');
    await page.getByPlaceholder('给五年后的自己').fill('草稿标题');
    await page.locator('textarea').first().fill('草稿内容');
    await expect(page.getByText(/已自动保存/)).toBeVisible({ timeout: 15_000 });

    await page.goto('/#/archive');
    await page.getByText('草稿标题').first().click();
    await expect(page.getByPlaceholder('给五年后的自己')).toHaveValue('草稿标题');
    await expect(page.locator('textarea').first()).toHaveValue('草稿内容');
  });
});

test.describe('时间胶囊', () => {
  test('选择模板并创建', async ({ page }) => {
    await page.goto('/#/capsule');
    await expect(page.getByRole('heading', { name: '时间胶囊' })).toBeVisible();

    await page.getByText('一年后的我').first().click();
    await expect(page.getByText('所有字段都是可选的')).toBeVisible();

    const firstTextarea = page.locator('textarea').first();
    await firstTextarea.fill('今天在写时间胶囊。');

    await page.getByRole('button', { name: '封存' }).first().click();
    await expect(page.getByText('确认封存这封信？')).toBeVisible();
    await page.getByRole('button', { name: '确认封存' }).click();

    await expect(page).toHaveURL(/\/letter\//, { timeout: 15_000 });
    await expect(page.getByText('已封存').first()).toBeVisible();
  });
});

test.describe('到期开启与回信', () => {
  test('到期信件可开启并写回信', async ({ page }) => {
    const now = Date.now();
    await seedLetter(page, {
      id: 'e2e-ready-letter',
      serial: 'FM-2025-E2E1',
      title: '来自过去的信',
      recipient: '未来的我',
      content: '# 你好\n\n这是一封已经被封存一年的信。',
      createdAt: new Date(now - 86_400_000 * 400).toISOString(),
      updatedAt: new Date(now - 86_400_000 * 400).toISOString(),
      scheduledOpenAt: new Date(now - 86_400_000 * 30).toISOString(),
      sealedAt: new Date(now - 86_400_000 * 400).toISOString(),
      status: 'READY',
      kind: 'future-self',
      cover: 'night',
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

    await page.goto('/#/archive?tab=ready');
    await expect(page.getByText('来自过去的信').first()).toBeVisible();
    await page.getByText('来自过去的信').first().click();
    await expect(page).toHaveURL(/\/letter\/e2e-ready-letter/);

    /* 正文在开启前不可见 */
    await expect(page.getByText('这是一封已经被封存一年的信')).toHaveCount(0);

    await page.getByRole('button', { name: '打开信件' }).first().click();
    await expect(page.getByText('现在打开这封信')).toBeVisible();
    await page.getByRole('button', { name: '打开信件' }).last().click();

    /* 开启后正文可见，并显示真实时间跨度 */
    await expect(page.getByText('这是一封已经被封存一年的信')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/相隔了 \d+ 天/)).toBeVisible();

    /* 回信 */
    await page.getByRole('button', { name: '写回信' }).click();
    await expect(page).toHaveURL(/compose\?replyTo=/);
    await expect(page.getByText(/回信给/)).toBeVisible();
  });

  test('未到期信件不能提前看到正文', async ({ page }) => {
    const now = Date.now();
    await seedLetter(page, {
      id: 'e2e-sealed-letter',
      serial: 'FM-2026-SEAL',
      title: '还没到时间的信',
      recipient: '未来的我',
      content: '这段内容现在不能出现。',
      createdAt: new Date(now - 86_400_000).toISOString(),
      updatedAt: new Date(now - 86_400_000).toISOString(),
      scheduledOpenAt: new Date(now + 86_400_000 * 365).toISOString(),
      sealedAt: new Date(now - 86_400_000).toISOString(),
      status: 'SEALED',
      kind: 'future-self',
      cover: 'night',
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

    await page.goto('/#/letter/e2e-sealed-letter');
    await expect(page.getByText('还没到时间的信').first()).toBeVisible();
    await expect(page.getByText('这段内容现在不能出现')).toHaveCount(0);

    /* 提前解封需要二次确认 */
    await page.getByRole('button', { name: '提前解封' }).first().click();
    await expect(page.getByText(/提前解封会破坏/)).toBeVisible();
    await page.getByRole('button', { name: /我确定，提前开启/ }).click();
    await expect(page.getByText('这段内容现在不能出现')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('分享卡片', () => {
  test('生成并仅展示用户选择的文字', async ({ page }) => {
    const now = Date.now();
    await seedLetter(page, {
      id: 'e2e-opened-letter',
      serial: 'FM-2024-E2E2',
      title: '分享测试',
      recipient: '未来的我',
      content: '这段正文绝不应该出现在分享卡片上。',
      createdAt: new Date(now - 86_400_000 * 500).toISOString(),
      updatedAt: new Date(now).toISOString(),
      scheduledOpenAt: new Date(now - 86_400_000).toISOString(),
      sealedAt: new Date(now - 86_400_000 * 500).toISOString(),
      openedAt: new Date(now).toISOString(),
      status: 'OPENED',
      kind: 'future-self',
      cover: 'night',
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

    await page.goto('/#/letter/e2e-opened-letter/share');
    await expect(page.getByRole('heading', { name: '分享卡片' })).toBeVisible();

    /* 卡片预览会生成 */
    await expect(page.locator('img[alt="卡片预览"]')).toBeVisible({ timeout: 25_000 });

    /* 下载 PNG */
    const downloadPromise = page.waitForEvent('download', { timeout: 25_000 });
    await page.getByRole('button', { name: '下载 PNG' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.png$/);

    /* 页面从不展示正文 */
    await expect(page.getByText('这段正文绝不应该出现在分享卡片上')).toHaveCount(0);
  });
});

test.describe('数据导出与导入', () => {
  test('导出 JSON 后可以重新导入', async ({ page }) => {
    await page.goto('/#/compose');
    await page.getByPlaceholder('给五年后的自己').fill('导出测试信件');
    await page.locator('textarea').first().fill('用于验证导出导入的内容。');
    await expect(page.getByText(/已自动保存/)).toBeVisible({ timeout: 15_000 });

    await page.goto('/#/settings');
    const downloadPromise = page.waitForEvent('download', { timeout: 25_000 });
    await page.getByRole('button', { name: '导出信件（不含附件）' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/);

    const path = await download.path();
    expect(path).toBeTruthy();

    /* 清空数据 */
    await page.getByRole('button', { name: '删除全部本地数据' }).click();
    await page.getByRole('button', { name: /我已备份/ }).click();
    await expect(page.getByText('全部本地数据已删除')).toBeVisible({ timeout: 20_000 });

    /* 重新导入 */
    const fileChooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '导入数据（JSON）' }).click();
    const chooser = await fileChooser;
    await chooser.setFiles(path!);
    await expect(page.getByText(/导入完成/)).toBeVisible({ timeout: 25_000 });

    await page.goto('/#/archive');
    await expect(page.getByText('导出测试信件').first()).toBeVisible();
  });
});

test.describe('设置与主题', () => {
  test('切换语言与主题', async ({ page }) => {
    await page.goto('/#/settings');

    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    /* 英文界面下按钮文案为 Light / Dark */
    await page.getByRole('button', { name: 'Light' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    await page.getByRole('button', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    /* 切回中文 */
    await page.getByRole('button', { name: '中文' }).click();
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
  });

  test('语言设置刷新后保持', async ({ page }) => {
    await page.goto('/#/settings');
    await page.getByRole('button', { name: 'English' }).click();
    /* 等界面真正切换（说明设置已写入 IndexedDB）再刷新 */
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: '中文' }).click();
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
  });
});

test.describe('隐私与本地存储说明', () => {
  test('界面明确说明数据只存在本地浏览器', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/只保存在这台设备的浏览器中/).first()).toBeVisible();
  });

  test('设置页说明未接入邮件投递', async ({ page }) => {
    await page.goto('/#/settings');
    await expect(page.getByText(/本版本未接入邮件投递服务/)).toBeVisible();
  });
});
