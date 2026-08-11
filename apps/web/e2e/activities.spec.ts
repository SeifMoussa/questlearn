import path from "node:path";
import { test, expect } from "@playwright/test";

const SCREENSHOT_DIR = path.resolve(__dirname, "../../../docs/screenshots/04-activities");

const DEMO_EMAIL = "demo.teacher@questlearn.dev";
const DEMO_PASSWORD = "DemoTeacher2026!";
const uniqueSuffix = Date.now();
const activityTitle = `Playwright activity ${uniqueSuffix}`;

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe.serial("activity browser journey: build -> order -> preview -> publish -> immutability", () => {
  test("log in and create a new activity from the activities list", async ({ page }) => {
    await login(page);

    await page.goto("/activities");
    await expect(page.getByRole("heading", { name: /activities/i })).toBeVisible();

    await page.getByRole("link", { name: /new activity/i }).click();
    await expect(page).toHaveURL(/\/activities\/new/);

    await page.getByLabel("Activity title").fill(activityTitle);
    await page.getByRole("button", { name: /create activity/i }).click();

    await expect(page).toHaveURL(/\/activities\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: activityTitle })).toBeVisible();
  });

  test("add 3 seeded questions from the bank picker", async ({ page }) => {
    await login(page);
    await page.goto("/activities");
    await page.getByTestId("activity-card").filter({ hasText: activityTitle }).click();

    const addButtons = page.getByTestId("bank-picker-row").getByRole("button", { name: /^add$/i });
    for (let i = 0; i < 3; i++) {
      await addButtons.first().click();
      await expect(page.getByTestId("activity-question-row")).toHaveCount(i + 1);
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "activity-builder.png"), fullPage: true });
  });

  test("reorder the questions with move-up/move-down controls", async ({ page }) => {
    await login(page);
    await page.goto("/activities");
    await page.getByTestId("activity-card").filter({ hasText: activityTitle }).click();

    const rows = page.getByTestId("activity-question-row");
    await expect(rows).toHaveCount(3);
    const firstPromptBefore = await rows.nth(0).innerText();

    // Move the first row down once, then confirm the order changed.
    await rows.nth(0).getByRole("button", { name: /^down$/i }).click();
    await expect(rows.nth(1)).toContainText(firstPromptBefore.split("\n")[1] ?? "");

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "question-ordering.png"), fullPage: true });
  });

  test("open the draft preview and confirm it shows live content, learner-style", async ({ page }) => {
    await login(page);
    await page.goto("/activities");
    await page.getByTestId("activity-card").filter({ hasText: activityTitle }).click();

    await page.getByRole("link", { name: /preview/i }).click();
    await expect(page).toHaveURL(/\/preview$/);

    const questions = page.getByTestId("activity-preview-question");
    await expect(questions).toHaveCount(3);
    await expect(page.getByTestId("learner-preview").first()).toBeVisible();
    // No answer-key emphasis anywhere on the preview.
    await expect(page.locator("body")).not.toContainText("(correct)");

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "learner-preview.png"), fullPage: true });
  });

  test("publish the activity behind a confirmation and confirm the locked read-only state", async ({ page }) => {
    await login(page);
    await page.goto("/activities");
    await page.getByTestId("activity-card").filter({ hasText: activityTitle }).click();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /^publish$/i }).click();

    await expect(page.getByText(/published — locked/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^publish$/i })).toHaveCount(0);
    await expect(page.getByTestId("activity-question-row").first().getByRole("button", { name: /^remove$/i })).toHaveCount(0);
  });

  test("editing an underlying question after publish does not change what the published activity shows", async ({ page }) => {
    await login(page);

    // Capture the first question's pre-edit prompt from the published preview.
    await page.goto("/activities");
    await page.getByTestId("activity-card").filter({ hasText: activityTitle }).click();
    await page.getByRole("link", { name: /preview/i }).click();
    const preEditPrompt = (await page.getByTestId("activity-preview-question").first().locator("p").nth(1).innerText()).trim();

    // Edit that same underlying question from the question bank.
    await page.goto("/questions");
    await page.getByTestId("question-card").filter({ hasText: preEditPrompt }).first().click();
    await page.getByRole("link", { name: /^edit$/i }).click();
    const editedPrompt = `${preEditPrompt} (edited after publish)`;
    await page.getByLabel("Prompt").fill(editedPrompt);
    await page.getByRole("button", { name: /save changes/i }).click();
    await expect(page.getByRole("heading", { name: editedPrompt })).toBeVisible();

    // Return to the published activity's preview: it must still show
    // the pre-edit prompt, proving the pin held against a real edit.
    await page.goto("/activities");
    await page.getByTestId("activity-card").filter({ hasText: activityTitle }).click();
    await page.getByRole("link", { name: /preview/i }).click();

    await expect(page.getByTestId("activity-preview-questions")).toContainText(preEditPrompt);
    await expect(page.getByTestId("activity-preview-questions")).not.toContainText(editedPrompt);
  });

  test("visiting an activity outside the caller's tenant shows the not-found state", async ({ page }) => {
    await login(page);
    await page.goto("/activities/00000000-0000-0000-0000-000000000000");
    await expect(page.getByText(/activity not found/i)).toBeVisible();
  });

  test("visiting /activities while unauthenticated redirects to /login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/activities");
    await expect(page).toHaveURL(/\/login/);
  });
});
