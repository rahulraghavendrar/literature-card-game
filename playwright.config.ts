import { defineConfig, devices } from '@playwright/test';

const PORT = 4178;

export default defineConfig({
  testDir: './e2e',
  timeout: 600_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Shorter animations keep end-to-end games quick; the app honours this setting.
    contextOptions: { reducedMotion: 'reduce' },
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    // The real game server, with announcements held for a shorter time.
    command: `npm run build && npx tsx server/index.ts`,
    env: { PORT: String(PORT), HOST: '127.0.0.1', LITERATURE_EVENT_LOCK_MS: '250' },
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
