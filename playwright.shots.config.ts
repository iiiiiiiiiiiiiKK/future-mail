import { defineConfig, devices } from '@playwright/test';

/**
 * 截图生成配置（不是断言测试）。
 * 用法：npm run screenshots
 * 会写入 docs/screenshots/，素材全部来自真实运行的构建产物。
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /screenshots\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 120_000,
  use: {
    baseURL: 'http://127.0.0.1:4180',
    /* 固定 DPR = 1，避免随项目放大成 4320px 巨图 */
    deviceScaleFactor: 1,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  },
  projects: [{ name: 'shots', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run preview -- --port 4180 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4180',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
