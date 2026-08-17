import path from "node:path";
import { test, expect } from "@playwright/test";

const SCREENSHOT_DIR = path.resolve(__dirname, "../../../docs/screenshots/07-gamification");

const DEMO_EMAIL = "demo.teacher@questlearn.dev";
const DEMO_PASSWORD = "DemoTeacher2026!";
const DEMO_LEARNER_EMAIL = "demo.learner@questlearn.dev";
const DEMO_LEARNER_PASSWORD = "DemoLearner2026!";

const uniqueSuffix = Date.now();
// Fixed, readable name -- this class and learner are still created
// for real through the UI below (proving the flow), they're just
// never the source of the three required screenshots (see the
// dedicated screenshot step further down).
const className = "Playwright Gamification Class";

const learnerName = "Playwright Gamification Learner";
const learnerEmail = `playwright.gamification+${uniqueSuffix}@questlearn.dev`;
const learnerPassword = "LearnerCorrectHorse123";

let joinCode = "";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/**
 * Exercises the Module 7 flow end to end: a teacher assigns the
 * seeded published activity to a fresh class -> a learner joins,
 * completes the attempt, and submits -> the learner's /xp page
 * reflects the resulting XP/level change. Produces the three Module 7
 * screenshots from the seeded demo learner's own (separately earned)
 * profile, per the screenshot-cleanliness convention already
 * established by `mastery.spec.ts`.
 */
test.describe.serial("gamification browser journey: assign -> join -> attempt -> submit -> xp reflects award", () => {
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

  test("a learner joins, completes the assignment, and sees updated XP and level on /xp", async ({ page }) => {
    await page.goto("/join");
    await page.getByLabel("Join code").fill(joinCode);
    await page.getByLabel("Full Name").fill(learnerName);
    await page.getByLabel("Email").fill(learnerEmail);
    await page.getByLabel("Password").fill(learnerPassword);
    await page.getByRole("button", { name: /join class/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    // Before completing anything, this brand-new learner has 0 XP.
    await page.goto("/xp");
    await expect(page.getByTestId("xp-profile")).toBeVisible();
    await expect(page.getByTestId("xp-profile")).toContainText("0");

    await page.goto("/dashboard");
    await page.getByTestId("learner-assignment-row").filter({ hasText: className }).click();
    await expect(page).toHaveURL(/\/assignments\/[0-9a-f-]+\/attempt$/);

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
      await expect(question).toBeVisible();
    }

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /^submit$/i }).click();
    await expect(page).toHaveURL(/\/attempts\/[0-9a-f-]+\/result$/);

    // Submitting an attempt always awards at least the flat
    // completion XP, so total XP must now be greater than zero, and
    // the quest_starter badge (this learner's first submitted
    // attempt) must be earned.
    await page.goto("/xp");
    await expect(page.getByTestId("xp-profile")).toBeVisible();
    const xpText = await page.getByTestId("xp-profile").innerText();
    expect(xpText).not.toContain("Total XP\n0");

    const questStarterBadge = page.getByTestId("achievement-badge").filter({ hasText: "Quest Starter" });
    await expect(questStarterBadge).toHaveAttribute("data-earned", "true");
  });

  /**
   * The exercise flow above proves the real assign -> join -> attempt
   * -> submit -> XP award pipeline end to end, but its throwaway
   * class/learner names carry a run timestamp, so they're the wrong
   * source for the three required module screenshots on a Docker
   * volume reused across verification runs. Captured here instead
   * from the seeded demo learner's own /xp page, whose XP and badges
   * come from `prisma/seed.ts`'s real submitted attempt -- no other
   * spec file in this suite touches the seeded learner's gamification
   * profile, so this is stable and clean regardless of how many times
   * the suite has run against the current database.
   */
  test("screenshots: seeded demo learner's XP page stays clean across repeated runs", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(DEMO_LEARNER_EMAIL);
    await page.getByLabel("Password").fill(DEMO_LEARNER_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/xp");
    await expect(page.getByTestId("xp-profile")).toBeVisible();
    await expect(page.getByTestId("level-progress")).toBeVisible();
    await expect(page.getByTestId("achievements-grid")).toBeVisible();

    await page.getByTestId("xp-profile").screenshot({ path: path.join(SCREENSHOT_DIR, "xp-profile.png") });
    await page.getByTestId("level-progress").screenshot({ path: path.join(SCREENSHOT_DIR, "level-progress.png") });
    await page.getByTestId("achievements-grid").screenshot({ path: path.join(SCREENSHOT_DIR, "achievements.png") });
  });

  test("visiting /xp while unauthenticated redirects to /login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/xp");
    await expect(page).toHaveURL(/\/login/);
  });
});
