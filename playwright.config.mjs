import { defineConfig } from '@playwright/test';
export default defineConfig({
    testDir: './tests/browser',
    timeout: 45000,
    fullyParallel: false,
    use: {
        baseURL: process.env.BASE_URL || 'http://127.0.0.1:4173',
        viewport: { width: 1440, height: 1000 },
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
    },
    webServer: process.env.BASE_URL
        ? undefined
        : {
              command: 'python3 scripts/serve.py',
              url: 'http://127.0.0.1:4173',
              reuseExistingServer: !process.env.CI,
          },
    workers: 1,
});
