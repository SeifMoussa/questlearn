import path from "node:path";
import { test, expect } from "@playwright/test";

const SCREENSHOT_DIR = path.resolve(__dirname, "../../../docs/screenshots/06-mastery");

const DEMO_EMAIL = "demo.teacher@questlearn.dev";
const DEMO_PASSWORD = "DemoTeacher2026!";
const DEMO_LEARNER_EMAIL = "demo.learner@questlearn.dev";
const DEMO_LEARNER_PASSWORD = "DemoLearner2026!";
const SEEDED_CLASS_NAME = "Period 3 — Earth Science";

const uniqueSuffix = Date.now();
const className = `Playwright Mastery Class ${uniqueSuffix}`;
// Fixed, readable name rather than a timestamp -- this concept is
// still created and tagged for real through the UI below (proving the
// tagging flow), it's just never the thing either screenshot shows
// (see the dedicated screenshot step further down), so a duplicate on
// a non-reset volume is a harmless, readable extra row rather than a
// wall of "Playwright Tagging Concept 1786..." variants.
const conceptName = "Playwright Tagging Flow Concept";

const learnerName = "Playwright Mastery Learner";
const learnerEmail = `playwright.mastery+${uniqueSuffix}@questlearn.dev`;
const learnerPassword = "LearnerCorrectHorse123";

let joinCode = "";
let classId = "";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/**
 * Exercises the full Module 6 flow end to end: a teacher creates a
 * new concept and tags it onto a seeded question through the real UI
 * (the seeded questions already carry their own tags from
 * prisma/seed.ts, but this spec still drives one real tagging action
 * so the flow itself is proven, not just the seeded state) -> assigns
 * the seeded, already-tagged published activity -> a learner joins,
 * completes it while revealing a hint -> the learner's /mastery view
 * and the teacher's /classes/:id/mastery view both reflect the same
 * evidence. Produces the two Module 6 screenshots.
 */
test.describe.serial("mastery browser journey: tag -> assign -> attempt with hint -> learner and teacher mastery views", () => {
  test("teacher creates a concept and tags it onto a seeded question", async ({ page }) => {
    await login(page);

    await page.goto("/concepts");
    await page.getByLabel("Name").fill(conceptName);
    await page.getByRole("button", { name: /create concept/i }).click();
    await expect(page.getByTestId("concepts-list")).toContainText(conceptName);

    await page.goto("/questions");
    await page.getByTestId("question-card").filter({ hasText: "Which planet is known as the Red Planet?" }).click();
    await expect(page.getByTestId("concepts-section")).toBeVisible();

    await page.locator('[data-testid="concepts-section"] select').selectOption(conceptName);
    await expect(page.getByTestId("attached-concepts")).toContainText(conceptName);
  });

  test("teacher creates a class and assigns the seeded, concept-tagged published activity to it", async ({ page }) => {
    await login(page);

    await page.goto("/classes/new");
    await page.getByLabel("Class name").fill(className);
    await page.getByRole("button", { name: /create class/i }).click();
    await expect(page).toHaveURL(/\/classes\/[0-9a-f-]+$/);
    classId = page.url().split("/classes/")[1];

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

  test("a learner joins, completes the assignment revealing a hint, and sees their mastery", async ({ page }) => {
    await page.goto("/join");
    await page.getByLabel("Join code").fill(joinCode);
    await page.getByLabel("Full Name").fill(learnerName);
    await page.getByLabel("Email").fill(learnerEmail);
    await page.getByLabel("Password").fill(learnerPassword);
    await page.getByRole("button", { name: /join class/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await page.getByTestId("learner-assignment-row").filter({ hasText: className }).click();
    await expect(page).toHaveURL(/\/assignments\/[0-9a-f-]+\/attempt$/);

    const questions = page.getByTestId("attempt-question");
    await expect(questions.first()).toBeVisible();
    const count = await questions.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const question = questions.nth(i);

      // The first question (planet question) has a hint — reveal it
      // via the click-to-reveal control, exercising the real
      // hintViewed-tracking flow, before answering it.
      if (await question.getByTestId("reveal-hint-button").count()) {
        await question.getByTestId("reveal-hint-button").click();
        await expect(question.getByTestId("hint-text")).toBeVisible();
      }

      if (await question.getByTestId("option-input").count()) {
        await question.getByTestId("option-input").first().check();
      } else if (await question.getByTestId("true-input").count()) {
        await question.getByTestId("true-input").check();
      } else if (await question.getByTestId("short-text-input").count()) {
        await question.getByTestId("short-text-input").fill("H2O");
      } else if (await question.getByTestId("numeric-input").count()) {
        await question.getByTestId("numeric-input").fill("100");
      }
      await expect(question).toBeVisible();
    }

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /^submit$/i }).click();
    await expect(page).toHaveURL(/\/attempts\/[0-9a-f-]+\/result$/);

    await page.goto("/mastery");
    await expect(page.getByTestId("mastery-concept-list")).toBeVisible();
    await expect(page.getByTestId("mastery-concept-card").first()).toBeVisible();
  });

  test("the owning teacher sees the same learner's mastery reflected on the class-mastery view", async ({ page }) => {
    await login(page);
    await page.goto(`/classes/${classId}/mastery`);

    await expect(page.getByTestId("class-mastery-stat-cards")).toBeVisible();
    await expect(page.getByTestId("class-mastery-learner-list")).toContainText(learnerName);
  });

  /**
   * The exercise flow above proves the real create -> tag -> assign ->
   * join -> attempt -> submit -> mastery pipeline end to end, but its
   * throwaway concept/class/learner names carry a run timestamp, so
   * they're the wrong source for the two required module screenshots
   * on a Docker volume that's been reused across verification runs
   * (screenshots would accumulate a growing list of "Playwright ..."
   * entries alongside the real seeded ones). Both screenshots are
   * captured here instead, from the seeded demo teacher/learner/class
   * that only `prisma/seed.ts` ever writes to -- no other spec file in
   * this suite touches "Period 3 — Earth Science" or the seeded
   * learner, so this is stable and clean regardless of how many times
   * the suite has run against the current database.
   */
  test("screenshots: seeded demo learner and class mastery views stay clean across repeated runs", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(DEMO_LEARNER_EMAIL);
    await page.getByLabel("Password").fill(DEMO_LEARNER_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/mastery");
    await expect(page.getByTestId("mastery-concept-list")).toBeVisible();
    await expect(page.getByTestId("mastery-concept-card").first()).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "learner-concept-view.png"), fullPage: true });

    await login(page);
    await page.goto("/classes");
    await page.getByTestId("class-card").filter({ hasText: SEEDED_CLASS_NAME }).click();
    await expect(page).toHaveURL(/\/classes\/[0-9a-f-]+$/);
    const seededClassId = page.url().split("/classes/")[1];

    await page.goto(`/classes/${seededClassId}/mastery`);
    await expect(page.getByTestId("class-mastery-stat-cards")).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "teacher-class-mastery-view.png"), fullPage: true });
  });

  test("visiting /mastery while unauthenticated redirects to /login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/mastery");
    await expect(page).toHaveURL(/\/login/);
  });
});
