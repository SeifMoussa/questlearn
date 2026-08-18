import path from "node:path";
import { test, expect } from "@playwright/test";

const SCREENSHOT_DIR = path.resolve(__dirname, "../../../docs/screenshots/08-quests");

const DEMO_EMAIL = "demo.teacher@questlearn.dev";
const DEMO_PASSWORD = "DemoTeacher2026!";
const DEMO_LEARNER_EMAIL = "demo.learner@questlearn.dev";
const DEMO_LEARNER_PASSWORD = "DemoLearner2026!";

const uniqueSuffix = Date.now();
// Timestamped, unlike mastery.spec.ts's fixed `conceptName` -- this
// quest is asserted against with a strict single-card filter further
// down (`getByTestId("quest-map-card").filter({ hasText: questTitle
// })`), which would hit a strict-mode violation against a duplicate
// from an earlier run on a non-reset volume if the name weren't
// unique. Still never the source of the two required screenshots (see
// the dedicated screenshot step further down), so this is purely
// about assertion correctness, not screenshot cleanliness.
const questTitle = `Playwright Quests Flow Quest ${uniqueSuffix}`;

const SEEDED_ACTIVITY_TITLE = "Published: Science & Math Fundamentals";
const SEEDED_QUEST_TITLE = "Science & Math Explorer";

async function loginAsTeacher(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function loginAsLearner(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO_LEARNER_EMAIL);
  await page.getByLabel("Password").fill(DEMO_LEARNER_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/**
 * Exercises the Module 8 flow end to end: a teacher builds a quest
 * with an activity-gated step through the real UI, gated on the
 * seeded published activity the demo learner already completed (see
 * prisma/seed.ts) -- so the moment the step exists, it's already
 * complete for that learner, proving gate evaluation reuses existing
 * Attempt data live rather than requiring a fresh submission. The
 * seeded "Science & Math Explorer" quest (2 steps, one complete, one
 * not) is the source of both required screenshots, per the
 * screenshot-cleanliness convention established by mastery.spec.ts
 * and gamification.spec.ts -- applied from this module's first commit
 * rather than fixed up afterward.
 */
test.describe.serial("quests browser journey: build -> steps -> learner sees live progress", () => {
  test("teacher builds a quest with an activity-gated step", async ({ page }) => {
    await loginAsTeacher(page);

    await page.goto("/quests/new");
    await page.getByLabel("Quest title").fill(questTitle);
    await page.getByRole("button", { name: /create quest/i }).click();
    await expect(page).toHaveURL(/\/quests\/[0-9a-f-]+$/);

    // Two selects at this point: activity, then concept.
    await page.locator("select").nth(0).selectOption(SEEDED_ACTIVITY_TITLE);
    await page.getByRole("button", { name: /^add step$/i }).click();

    await expect(page.getByTestId("quest-step-list")).toContainText(`Complete "${SEEDED_ACTIVITY_TITLE}"`);
  });

  test("the demo learner immediately sees the new quest's step already complete, and the seeded quest shows real mixed progress", async ({ page }) => {
    await loginAsLearner(page);
    await page.goto("/quests/map");

    const newQuestCard = page.getByTestId("quest-map-card").filter({ hasText: questTitle });
    await expect(newQuestCard).toBeVisible();
    // The gate is "submitted an attempt for this activity" -- the demo
    // learner already has one from prisma/seed.ts, so this brand-new
    // step reads as complete without the learner doing anything new.
    await expect(newQuestCard).toContainText("Completed");

    const seededQuestCard = page.getByTestId("quest-map-card").filter({ hasText: SEEDED_QUEST_TITLE });
    await expect(seededQuestCard).toBeVisible();
    await expect(seededQuestCard).toContainText("Complete \"" + SEEDED_ACTIVITY_TITLE + "\"");
    await expect(seededQuestCard).toContainText("Reach Proficient on \"Number Theory\"");
    // Seeded attempt answered the Number Theory question wrong, so the
    // seeded quest itself is NOT complete -- only step 1 is.
    await expect(seededQuestCard).not.toContainText("Completed —");
  });

  test("screenshots: seeded quest via teacher builder and seeded demo learner's map stay clean across repeated runs", async ({ page }) => {
    await loginAsTeacher(page);
    await page.goto("/quests");
    await page.getByTestId("quest-card").filter({ hasText: SEEDED_QUEST_TITLE }).click();
    await expect(page).toHaveURL(/\/quests\/[0-9a-f-]+$/);
    await expect(page.getByTestId("quest-step-list")).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "quest-builder.png"), fullPage: true });

    await loginAsLearner(page);
    await page.goto("/quests/map");
    await expect(page.getByTestId("quest-map-list")).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "learner-quest-map.png"), fullPage: true });
  });

  test("a step rejected without any gate shows a validation error", async ({ page }) => {
    await loginAsTeacher(page);
    await page.goto("/quests/new");
    await page.getByLabel("Quest title").fill(`Playwright No-Gate Quest ${uniqueSuffix}`);
    await page.getByRole("button", { name: /create quest/i }).click();
    await expect(page).toHaveURL(/\/quests\/[0-9a-f-]+$/);

    await page.getByRole("button", { name: /^add step$/i }).click();
    await expect(page.getByTestId("add-step-error")).toBeVisible();
  });

  test("visiting /quests/map while unauthenticated redirects to /login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/quests/map");
    await expect(page).toHaveURL(/\/login/);
  });
});
