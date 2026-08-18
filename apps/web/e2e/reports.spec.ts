import path from "node:path";
import { test, expect } from "@playwright/test";

const SCREENSHOT_DIR = path.resolve(__dirname, "../../../docs/screenshots/09-reporting-admin");

const DEMO_EMAIL = "demo.teacher@questlearn.dev";
const DEMO_PASSWORD = "DemoTeacher2026!";

const SEEDED_CLASS_NAME = "Period 3 — Earth Science";
const SEEDED_ACTIVITY_TITLE = "Published: Science & Math Fundamentals";
const SEEDED_LEARNER_NAME = "Casey Nguyen";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/**
 * Every number on every one of Module 9's three views is a direct
 * function of the seeded demo teacher's real data (one class, one
 * published activity, one submitted attempt, real mastery/XP/quest
 * state) -- unlike every prior module, this one reads existing state
 * rather than creating anything, so there's no throwaway entity to
 * build first and no screenshot-cleanliness concern to route around:
 * navigating straight to the seeded pages IS the real flow.
 */
test.describe.serial("reports browser journey: class dashboard -> question analysis -> learner report", () => {
  let classId = "";
  let activityId = "";

  // Each test gets a fresh, isolated browser context (no cookie
  // persistence across tests, even within one describe.serial block)
  // -- every test that needs the teacher's session logs in again here
  // rather than assuming test 1's login carries over.
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("teacher opens the seeded class's report from the class detail page", async ({ page }) => {
    await page.goto("/classes");
    await page.getByTestId("class-card").filter({ hasText: SEEDED_CLASS_NAME }).click();
    await expect(page).toHaveURL(/\/classes\/[0-9a-f-]+$/);
    classId = page.url().match(/\/classes\/([0-9a-f-]+)$/)![1];

    await page.getByRole("link", { name: /^report$/i }).click();
    await expect(page).toHaveURL(new RegExp(`/classes/${classId}/report$`));

    await expect(page.getByTestId("report-summary")).toBeVisible();
    const row = page.getByTestId("assignment-report-row").filter({ hasText: SEEDED_ACTIVITY_TITLE });
    await expect(row).toBeVisible();
    await expect(row).toContainText("submitted");
  });

  test("downloading the CSV produces a real file with the expected header row", async ({ page }) => {
    await page.goto(`/classes/${classId}/report`);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /download csv/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain(".csv");

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(chunk as Buffer);
    const content = Buffer.concat(chunks).toString("utf-8");
    expect(content.split("\r\n")[0]).toBe("Assignment,Due Date,Assigned,Submitted,Completion Rate,Average Score");
    expect(content).toContain(SEEDED_ACTIVITY_TITLE);
  });

  test("teacher opens the learner report from the class dashboard's roster list", async ({ page }) => {
    await page.goto(`/classes/${classId}/report`);
    const learnerRow = page.getByTestId("report-learner-row").filter({ hasText: SEEDED_LEARNER_NAME });
    await expect(learnerRow).toBeVisible();
    await learnerRow.getByRole("link", { name: /view report/i }).click();

    await expect(page).toHaveURL(new RegExp(`/classes/${classId}/learners/[0-9a-f-]+/report$`));
    await expect(page.getByTestId("learner-report-gamification")).toBeVisible();
    await expect(page.getByTestId("learner-report-attempts-list")).toContainText(SEEDED_ACTIVITY_TITLE);
    await expect(page.getByTestId("learner-report-mastery-list")).toBeVisible();
    await expect(page.getByTestId("learner-report-quests-list")).toBeVisible();
  });

  test("teacher opens question analysis from the activity detail page", async ({ page }) => {
    await page.goto("/activities");
    await page.getByTestId("activity-card").filter({ hasText: SEEDED_ACTIVITY_TITLE }).click();
    await expect(page).toHaveURL(/\/activities\/[0-9a-f-]+$/);
    activityId = page.url().match(/\/activities\/([0-9a-f-]+)$/)![1];

    await page.getByRole("link", { name: /^report$/i }).click();
    await expect(page).toHaveURL(new RegExp(`/activities/${activityId}/report$`));

    const rows = page.getByTestId("activity-report-row");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test("screenshots: seeded class dashboard, question analysis, and learner report", async ({ page }) => {
    await page.goto(`/classes/${classId}/report`);
    await expect(page.getByTestId("report-summary")).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "teacher-dashboard.png"), fullPage: true });

    await page.goto(`/activities/${activityId}/report`);
    await expect(page.getByTestId("activity-report-list")).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "question-analysis.png"), fullPage: true });

    const learnerRow = page.getByTestId("report-learner-row").filter({ hasText: SEEDED_LEARNER_NAME });
    await page.goto(`/classes/${classId}/report`);
    await learnerRow.getByRole("link", { name: /view report/i }).click();
    await expect(page.getByTestId("learner-report-gamification")).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "learner-report.png"), fullPage: true });
  });

  test("visiting a class report while unauthenticated redirects to /login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`/classes/${classId}/report`);
    await expect(page).toHaveURL(/\/login/);
  });
});
