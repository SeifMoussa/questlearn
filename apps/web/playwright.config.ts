import { defineConfig, devices } from "@playwright/test";

/**
 * Servers (API + web) are started manually outside Playwright for
 * this module, not via `webServer`, so the API's stdout can be
 * redirected to a log file the auth flow test reads from directly —
 * that log is the only place the dev EmailService's verification and
 * password-reset tokens ever appear (see apps/api's known limitation:
 * no real email provider is wired up yet).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  // Every spec file drives the same shared demo account and the same
  // dev-log-scraping trick (see support/api-log.ts) against one
  // running server, and shares the login rate-limit bucket besides —
  // running files in parallel across workers races both. Force
  // strictly serial execution across the whole suite, not just within
  // one file's describe.serial block.
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.WEB_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
