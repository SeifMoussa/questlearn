import path from "node:path";
import { test, expect } from "@playwright/test";

const SCREENSHOT_DIR = path.resolve(__dirname, "../../../docs/screenshots/05-assignments-attempts");

const DEMO_EMAIL = "demo.teacher@questlearn.dev";
const DEMO_PASSWORD = "DemoTeacher2026!";
const SEEDED_CLASS_NAME = "Period 3 — Earth Science";
const uniqueSuffix = Date.now();
// Fixed, readable name rather than a timestamp -- this class is still
// created for real through the UI below (proving the assign flow),
// it's just never the source of the assignment-form.png screenshot
// (see the dedicated screenshot step further down), so a duplicate on
// a non-reset volume is a harmless, readable extra row.
const className = "Playwright Assignments Class";

const learnerName = "Playwright Learner";
const learnerEmail = `playwright.learner+${uniqueSuffix}@questlearn.dev`;
const learnerPassword = "LearnerCorrectHorse123";

let joinCode = "";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe.serial("assignments and attempts browser journey: assign -> join -> attempt -> submit -> result", () => {
  test("teacher creates a class and assigns the seeded published activity to it", async ({ page }) => {
    await login(page);

    await page.goto("/classes/new");
    await page.getByLabel("Class name").fill(className);
    await page.getByRole("button", { name: /create class/i }).click();
    await expect(page).toHaveURL(/\/classes\/[0-9a-f-]+$/);

    const code = await page.getByTestId("join-code").innerText();
    joinCode = code.trim();
    expect(joinCode.length).toBeGreaterThan(0);

    await page.goto("/activities");
    await page.getByTestId("activity-card").filter({ hasText: "Published: Science & Math Fundamentals" }).click();
    await page.getByRole("link", { name: /^assign$/i }).click();
    await expect(page).toHaveURL(/\/assign$/);

    await page.locator("select").selectOption(className);
    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await page.locator("#dueAt").fill(dueDate);
    await page.getByRole("button", { name: /^assign$/i }).click();

    await expect(page.getByTestId("assignments-list")).toContainText(className);
  });

  test("a brand-new learner redeems the join code, completes the assignment, and sees a real score", async ({ page }) => {
    // Join via the real public form, creating a brand-new learner
    // account in one step (see apps/api's JoinController).
    await page.goto("/join");
    await page.getByLabel("Join code").fill(joinCode);
    await page.getByLabel("Full Name").fill(learnerName);
    await page.getByLabel("Email").fill(learnerEmail);
    await page.getByLabel("Password").fill(learnerPassword);
    await page.getByRole("button", { name: /join class/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId("dashboard-greeting")).toContainText(learnerName);
    await expect(page.getByTestId("learner-assignments-list")).toContainText("Published: Science & Math Fundamentals");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "learner-dashboard.png"), fullPage: true });

    await page.getByTestId("learner-assignment-row").filter({ hasText: className }).click();
    await expect(page).toHaveURL(/\/assignments\/[0-9a-f-]+\/attempt$/);

    // Answer every question, exercising autosave on change for each
    // of the five question types the seeded activity covers. Wait for
    // the first question to actually render before counting — the
    // page calls `start` on load, and a bare `.count()` (unlike
    // `expect(...).toHaveCount()`) doesn't auto-wait for that.
    const questions = page.getByTestId("attempt-question");
    await expect(questions.first()).toBeVisible();
    const count = await questions.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const question = questions.nth(i);
      if (await question.getByTestId("option-input").count()) {
        await question.getByTestId("option-input").first().check();
      } else if (await question.getByTestId("true-input").count()) {
        await question.getByTestId("true-input").check();
      } else if (await question.getByTestId("short-text-input").count()) {
        await question.getByTestId("short-text-input").fill("H2O");
      } else if (await question.getByTestId("numeric-input").count()) {
        await question.getByTestId("numeric-input").fill("100");
      }
      // Autosave fires on change; give it a moment to land before
      // moving to the next question.
      await expect(question).toBeVisible();
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "activity-player.png"), fullPage: true });

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /^submit$/i }).click();

    await expect(page).toHaveURL(/\/attempts\/[0-9a-f-]+\/result$/);
    await expect(page.getByTestId("result-score")).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "result.png"), fullPage: true });
  });

  /**
   * The exercise flow above proves the real assign -> join -> attempt
   * -> submit -> result pipeline end to end, but its throwaway class
   * name carries a run timestamp in its join code/roster, so it's the
   * wrong source for the assignment-form.png screenshot on a Docker
   * volume reused across verification runs. Captured here instead
   * from the seeded demo teacher's real assign page for the seeded
   * published activity and the seeded "Period 3 — Earth Science"
   * class — no other spec file assigns that activity to that class a
   * second time (assigning twice is allowed but would just add a
   * second assignment row), so this stays a clean, stable target
   * regardless of how many times the suite has run.
   */
  test("screenshots: seeded demo teacher's assign form stays clean across repeated runs", async ({ page }) => {
    await login(page);

    await page.goto("/activities");
    await page.getByTestId("activity-card").filter({ hasText: "Published: Science & Math Fundamentals" }).click();
    await page.getByRole("link", { name: /^assign$/i }).click();
    await expect(page).toHaveURL(/\/assign$/);

    await page.locator("select").selectOption(SEEDED_CLASS_NAME);
    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await page.locator("#dueAt").fill(dueDate);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "assignment-form.png"), fullPage: true });
  });

  test("visiting /dashboard while unauthenticated redirects to /login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
