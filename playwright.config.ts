import { defineConfig, devices } from '@playwright/test';

/**
 * Chromium only, against the real dev server (client and API share one
 * origin exactly as in production — see `vite.config.ts`'s `apiPlugin`).
 *
 * Port 5176, not the app's default 5173: this worktree runs alongside other
 * workers' worktrees on the same host, each of which may have its own dev
 * server up on 5173 at the same time. 5176 avoids that collision without
 * touching `vite.config.ts` (forbidden file) — `vite` takes `--port` on the
 * command line.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5176',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 5176',
    url: 'http://localhost:5176',
    reuseExistingServer: true,
  },
});
