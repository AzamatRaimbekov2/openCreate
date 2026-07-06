// Playwright config (plan Task 21). The suite runs against the REAL vite dev
// server (webServer boots it and waits for :5173) while every backend call is
// mocked per-test in e2e/mocks.ts — deterministic, no API process required.
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Mock state is per-page, so tests are safe to parallelize; keep retries at
  // 0 locally — a flaky mock-driven test is a bug, not weather.
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:5173',
    // Traces only when something fails — free in the green case, invaluable red
    trace: 'retain-on-failure',
  },
  // Chromium only (plan): the suite verifies SPA wiring, not browser quirks
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    port: 5173,
    // Reuse a dev server that is already up locally; CI always gets a fresh one
    reuseExistingServer: !process.env.CI,
  },
})
