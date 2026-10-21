import { defineConfig, devices } from '@playwright/test';

// Browser tests against the Vite dev server. The API is mocked per test (see e2e/mock-api.ts),
// so wrangler, D1, Google sign-in and API keys aren't needed.
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5174',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // Its own port, so a `npm run dev` you have open doesn't get in the way.
    command: 'npm run dev:web -- --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
  },
});
