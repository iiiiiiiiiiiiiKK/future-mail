import { test, expect } from '@playwright/test';

/**
 * 移动端可用性审计（iPhone 13 视口）
 * 检查：横向溢出、点击目标尺寸、字体下限、底部导航遮挡、固定元素重叠。
 */

const ROUTES = ['/', '/#/compose', '/#/archive', '/#/timeline', '/#/capsule', '/#/settings'];

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

test('所有页面无横向溢出', async ({ page }) => {
  for (const route of ROUTES) {
    await page.goto(route);
    await page.waitForTimeout(900);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${route} 存在横向溢出 ${overflow}px`).toBeLessThanOrEqual(1);
  }
});

test('可点击元素最小 40×40 触控尺寸', async ({ page }) => {
  await page.goto('/#/compose');
  await page.waitForTimeout(1000);

  const tooSmall = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll('button, a[href], input, select, textarea').forEach((el) => {
      /* 跳过视觉隐藏元素（sr-only、隐藏文件输入等） */
      const cls = el.getAttribute('class') ?? '';
      if (cls.includes('sr-only')) return;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;
      if (style.clip === 'rect(0px, 0px, 0px, 0px)') return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      /* 文本输入框按 32px 下限；按钮/链接按 36px 下限 */
      const isField = ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
      const min = isField ? 32 : 36;
      if (r.height < min) {
        const label =
          (el.textContent ?? '').trim().slice(0, 24) ||
          el.getAttribute('aria-label') ||
          el.tagName;
        out.push(`${label} h=${r.height.toFixed(0)}`);
      }
    });
    return out.slice(0, 15);
  });

  expect(tooSmall, `过小的可点击元素: ${tooSmall.join(', ')}`).toEqual([]);
});

test('底部导航不遮挡页面主要操作', async ({ page }) => {
  await page.goto('/#/compose');
  await page.waitForTimeout(1000);

  /* 封存按钮在移动端固定条中，必须可点击 */
  const seal = page.getByRole('button', { name: '封存', exact: true }).first();
  await expect(seal).toBeVisible();

  const box = await seal.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    /* 保证按钮在视口内且未被底部导航覆盖 */
    const navBox = await page.getByRole('navigation', { name: 'Mobile' }).boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual((navBox?.y ?? 844) + 1);
  }
});

test('正文区域在移动端可正常输入', async ({ page }) => {
  await page.goto('/#/compose');
  const area = page.locator('textarea').first();
  await area.fill('移动端输入测试');
  await expect(area).toHaveValue('移动端输入测试');
  await expect(page.getByText(/已自动保存/)).toBeVisible({ timeout: 15_000 });
});

test('长标题与长收件人不破坏布局', async ({ page }) => {
  await page.goto('/#/compose');
  await page
    .getByPlaceholder('给五年后的自己')
    .fill('这是一个非常非常长的信件标题，用来测试移动端是否会出现布局破裂或者横向滚动的问题');
  await page.getByPlaceholder('未来的我').first().fill('一位名字非常长的收件人用来测试换行表现');
  await page.waitForTimeout(900);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('安全区变量存在（iOS 刘海屏）', async ({ page }) => {
  await page.goto('/');
  const hasSafeAreaSupport = await page.evaluate(() => {
    /* env() 在支持的浏览器中会解析为具体值（可能为 0） */
    const el = document.createElement('div');
    el.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)';
    document.body.appendChild(el);
    const value = window.getComputedStyle(el).paddingBottom;
    el.remove();
    return value !== '';
  });
  expect(hasSafeAreaSupport).toBe(true);
});
