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
