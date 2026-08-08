import path from "node:path";
import { test, expect } from "@playwright/test";

const SCREENSHOT_DIR = path.resolve(__dirname, "../../../docs/screenshots/02-classes");

const DEMO_EMAIL = "demo.teacher@questlearn.dev";
const DEMO_PASSWORD = "DemoTeacher2026!";
const uniqueSuffix = Date.now();
const className = `Playwright Test Class ${uniqueSuffix}`;
const rosterName = "Taylor Nguyen";
const rosterEmail = `taylor.nguyen+${uniqueSuffix}@example.com`;

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe.serial("class browser journey: login -> create -> roster -> rotate", () => {
  test("log in, create a class, and see it in the class list", async ({ page }) => {
    await login(page);

    await page.goto("/classes");
    await expect(page.getByRole("heading", { name: /your classes/i })).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "class-list.png"), fullPage: true });

    await page.getByRole("link", { name: /new class/i }).click();
    await expect(page).toHaveURL(/\/classes\/new/);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "create-class-form.png"), fullPage: true });

    await page.getByLabel("Class name").fill(className);
    await page.getByRole("button", { name: /create class/i }).click();

    await expect(page).toHaveURL(/\/classes\/[0-9a-f-]+$/);
    await expect(page.getByTestId("class-name")).toContainText(className);

    await page.goto("/classes");
    await expect(page.getByTestId("classes-list")).toContainText(className);
  });

  test("open class detail, see the join code, manage roster, and rotate the code", async ({ page }) => {
    await login(page);
    await page.goto("/classes");

    await page.getByTestId("class-card").filter({ hasText: className }).click();
    await expect(page.getByTestId("class-name")).toContainText(className);

    const originalCode = (await page.getByTestId("join-code").textContent())?.trim();
    expect(originalCode).toMatch(/^[A-Z0-9]{8}$/);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "class-detail.png"), fullPage: true });

    // Add a roster entry.
    await page.getByLabel("Student name").fill(rosterName);
    await page.getByLabel("Email (optional)").fill(rosterEmail);
    await page.getByRole("button", { name: /^add$/i }).click();

    await expect(page.getByTestId("roster-list")).toContainText(rosterName);
    await expect(page.getByTestId("roster-list")).toContainText(rosterEmail);

    // Remove it and confirm it disappears.
    await page
      .getByTestId("roster-entry")
      .filter({ hasText: rosterName })
      .getByRole("button", { name: /remove/i })
      .click();

    await expect(page.getByTestId("roster-empty")).toBeVisible();

    // Rotate the join code (confirm() dialog auto-accepted).
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /rotate code/i }).click();

    await expect(page.getByTestId("join-code")).not.toHaveText(originalCode ?? "");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "join-code-rotated.png"), fullPage: true });
  });

  test("visiting a class outside the caller's tenant shows the same not-found state", async ({ page }) => {
    await login(page);
    await page.goto("/classes/00000000-0000-0000-0000-000000000000");
    await expect(page.getByTestId("class-not-found")).toBeVisible();
  });

  test("visiting /classes while unauthenticated redirects to /login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/classes");
    await expect(page).toHaveURL(/\/login/);
  });
});
