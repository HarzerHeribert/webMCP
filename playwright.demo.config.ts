import { defineConfig } from '@playwright/test';

/**
 * The recording run — separate from `playwright.config.ts` so `npm run test:e2e`
 * never picks it up. It is not a test: it drives the demo once, in real Chrome
 * with WebMCP enabled, and keeps the video.
 *
 * `channel: 'chrome'` and the flag are the whole point. `localhost` counts as a
 * secure origin, so `document.modelContext` is present here exactly as it is on
 * the deployed site, and the footage shows the real registration path rather
 * than the simulated caller.
 */
export default defineConfig({
  testDir: './demo',
  timeout: 300_000,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  outputDir: './demo/out',
  use: {
    baseURL: 'http://localhost:5176',
    viewport: { width: 1600, height: 1000 },
    channel: 'chrome',
    launchOptions: { args: ['--enable-features=WebMCP', '--hide-scrollbars'] },
    video: { mode: 'on', size: { width: 1600, height: 1000 } },
  },
  webServer: {
    command: 'npm run dev -- --port 5176',
    url: 'http://localhost:5176',
    reuseExistingServer: true,
  },
});
