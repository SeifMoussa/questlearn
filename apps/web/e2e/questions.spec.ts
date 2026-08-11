import path from "node:path";
import { test, expect } from "@playwright/test";

const SCREENSHOT_DIR = path.resolve(__dirname, "../../../docs/screenshots/03-questions");

const DEMO_EMAIL = "demo.teacher@questlearn.dev";
const DEMO_PASSWORD = "DemoTeacher2026!";
const uniqueSuffix = Date.now();
const prompt = `Playwright test question ${uniqueSuffix}: what is 6 x 7?`;
const editedPrompt = `${prompt} (edited)`;

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe.serial("question bank browser journey: login -> bank -> create -> edit -> preview", () => {
  test("log in and see the seeded question bank", async ({ page }) => {
    await login(page);

    await page.goto("/questions");
    await expect(page.getByRole("heading", { name: /question bank/i })).toBeVisible();
    await expect(page.getByTestId("questions-list")).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "question-bank.png"), fullPage: true });
  });

  test("create a new single-choice question through the real form", async ({ page }) => {
    await login(page);
    await page.goto("/questions");

    await page.getByRole("link", { name: /new question/i }).click();
    await expect(page).toHaveURL(/\/questions\/new/);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "create-question-form.png"), fullPage: true });

    await page.getByLabel("Prompt").fill(prompt);

    const optionRows = page.getByTestId("option-row");
    await optionRows.nth(0).getByPlaceholder("Option 1").fill("42");
    await optionRows.nth(1).getByPlaceholder("Option 2").fill("41");
    await optionRows.nth(0).locator('input[type="radio"]').check();

    await page.getByRole("button", { name: /create question/i }).click();

    await expect(page).toHaveURL(/\/questions\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: prompt })).toBeVisible();
    await expect(page.getByTestId("version-number")).toContainText("Version 1");

    await page.goto("/questions");
    await expect(page.getByTestId("questions-list")).toContainText(prompt);
  });

  test("open the question, edit it, and confirm the version incremented", async ({ page }) => {
    await login(page);
    await page.goto("/questions");

    await page.getByTestId("question-card").filter({ hasText: prompt }).click();
    await expect(page.getByTestId("version-number")).toContainText("Version 1");
    await expect(page.getByTestId("answer-key")).toBeVisible();

    await page.getByRole("link", { name: /^edit$/i }).click();
    await expect(page).toHaveURL(/\/edit$/);

    await page.getByLabel("Prompt").fill(editedPrompt);
    await page.getByRole("button", { name: /save changes/i }).click();

    await expect(page).toHaveURL(/\/questions\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: editedPrompt })).toBeVisible();
    await expect(page.getByTestId("version-number")).toContainText("Version 2");
  });

  test("toggle to the preview view and confirm it renders without exposing the correct answer", async ({ page }) => {
    await login(page);
    await page.goto("/questions");
    await page.getByTestId("question-card").filter({ hasText: editedPrompt }).click();

    await page.getByText("Preview", { exact: true }).click();
    const previewEl = page.getByTestId("learner-preview");
    await expect(previewEl).toBeVisible();
    await expect(previewEl).toContainText(editedPrompt);

    // The preview must not reveal which option is correct: no
    // "(correct)" marker text and no answer-key element rendered.
    await expect(previewEl).not.toContainText("(correct)");
    await expect(page.getByTestId("answer-key-options")).toHaveCount(0);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "question-preview.png"), fullPage: true });
  });

  test("visiting a question outside the caller's tenant shows the same not-found state", async ({ page }) => {
    await login(page);
    await page.goto("/questions/00000000-0000-0000-0000-000000000000");
    await expect(page.getByText(/question not found/i)).toBeVisible();
  });

  test("visiting /questions while unauthenticated redirects to /login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/questions");
    await expect(page).toHaveURL(/\/login/);
  });
});
