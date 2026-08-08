import path from "node:path";
import { test, expect } from "@playwright/test";
import { readLatestToken } from "./support/api-log";

const API_LOG_PATH = path.resolve(__dirname, "../../api/dev.log");
const SCREENSHOT_DIR = path.resolve(__dirname, "../../../docs/screenshots/01-authentication");

const uniqueSuffix = Date.now();
const email = `playwright.tester+${uniqueSuffix}@questlearn.dev`;
const name = "Playwright Tester";
const password = "CorrectHorse123";

test.describe.serial("auth flow: register -> verify -> login -> dashboard -> logout", () => {
  test("register page renders an empty form", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: /create your teacher account/i })).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "register-page.png"), fullPage: true });
  });

  test("register shows client-side validation errors", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Full Name").fill("");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "register-validation.png"), fullPage: true });
  });

  test("register, verify by email token, then log in and reach the dashboard", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Full Name").fill(name);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page.getByTestId("register-success")).toBeVisible();

    const token = readLatestToken(API_LOG_PATH, "verification_email", email);
    await page.goto(`/verify-email?token=${encodeURIComponent(token)}`);
    await expect(page.getByTestId("verify-success")).toBeVisible();

    await page.goto("/login");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "login-page.png"), fullPage: true });

    // Wrong password first, to capture the invalid-credentials state.
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("wrong-password-123");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByTestId("login-error-banner")).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "login-error.png"), fullPage: true });

    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId("dashboard-greeting")).toContainText(name);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "authenticated-dashboard.png"), fullPage: true });

    await page.getByRole("button", { name: /log out/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("visiting /dashboard while unauthenticated redirects to /login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
