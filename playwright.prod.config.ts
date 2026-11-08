import { defineConfig, devices } from '@playwright/test';

/**
 * 生产环境验收配置：不启动本地服务器，直接访问已部署的线上地址。
 * 用法：npx playwright test -c playwright.prod.config.ts
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /production\.spec\.ts/,
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [['list']],
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  },
  projects: [
    {
      name: 'prod-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'prod-mobile',
      use: { ...devices['iPhone 13'] },
    },
  ],
});
