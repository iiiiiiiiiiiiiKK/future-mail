import { defineConfig, devices } from '@playwright/test';

/**
 * 本地端到端测试配置。
 * 使用生产构建的 preview 服务器，确保测试的是真实交付物。
 * 生产环境验收测试在 playwright.prod.config.ts 中单独运行。
 */
export default defineConfig({
  testDir: './e2e',
  /* production.spec.ts 针对线上地址，需用 playwright.prod.config.ts 运行 */
  /* screenshots.spec.ts 是「截图生成器」而非断言测试，用 npm run screenshots 单独执行 */
  testIgnore: [/production\.spec\.ts/, /screenshots\.spec\.ts/],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:4180',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: 'npm run preview -- --port 4180 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4180',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
