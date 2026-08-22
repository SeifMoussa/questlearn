import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as argon2 from "argon2";
import { generateJoinCode, joinCodeExpiry } from "../src/classes/join-code.util";
import { scoreQuestion, overallScore } from "../src/attempts/scoring";
import { MasteryService } from "../src/mastery/mastery.service";
import { GamificationService } from "../src/gamification/gamification.service";

/**
 * Seeds one fictional demo teacher account so the login screen and
 * manual testing have something real to authenticate against. Purely
 * fictional data, per the master spec's ethics constraints — this is
 * not a real person or institution.
 */
const DEMO_TENANT_NAME = "Maple Grove Elementary (Demo)";
const DEMO_EMAIL = "demo.teacher@questlearn.dev";
const DEMO_NAME = "Jordan Rivera";
const DEMO_PASSWORD = "DemoTeacher2026!";

// A fictional demo learner account — Module 5's real-learner-accounts
// design decision, seeded here (rather than only ever created through
// the live /classes/join form) so the learner dashboard/result
// screenshots have real populated content without a manual redemption
// step every time the seed script runs.
const DEMO_LEARNER_EMAIL = "demo.learner@questlearn.dev";
const DEMO_LEARNER_NAME = "Casey Nguyen";
const DEMO_LEARNER_PASSWORD = "DemoLearner2026!";

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    let user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });

    if (!user) {
      const passwordHash = await argon2.hash(DEMO_PASSWORD, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });

      const tenant = await prisma.tenant.create({
        data: { name: DEMO_TENANT_NAME },
      });

      user = await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: DEMO_EMAIL,
          name: DEMO_NAME,
          passwordHash,
          role: "teacher",
          emailVerifiedAt: new Date(),
        },
      });

      console.log("Seeded demo teacher account:");
      console.log(`  email:    ${user.email}`);
      console.log(`  password: ${DEMO_PASSWORD} (development only)`);
      console.log(`  tenant:   ${tenant.name}`);
    } else {
      console.log(`Demo teacher already exists (${DEMO_EMAIL}).`);
    }

    await seedDemoClasses(prisma, user.tenantId, user.id);
    await seedDemoQuestions(prisma, user.tenantId, user.id);
    await seedDemoConcepts(prisma, user.tenantId, user.id);
    await seedDemoActivities(prisma, user.tenantId, user.id);
    const learner = await seedDemoLearner(prisma, user.tenantId);
    if (learner) {
      await seedDemoAssignmentAndAttempt(prisma, user.tenantId, user.id, learner);
      await seedDemoAdditionalMasteryAttempts(prisma, user.tenantId, user.id, learner);
    }
    await seedDemoQuest(prisma, user.tenantId, user.id);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Fictional demo classes and roster entries for the demo teacher, so
 * the class-list and class-detail screens have real populated content
 * to screenshot instead of an empty state. No real student data.
 */
async function seedDemoClasses(prisma: PrismaClient, tenantId: string, teacherId: string): Promise<void> {
  const existingClasses = await prisma.class.count({ where: { tenantId, teacherId } });
  if (existingClasses > 0) {
    console.log("Demo classes already exist; skipping.");
    return;
  }

  const homeroom = await prisma.class.create({
    data: {
      tenantId,
      teacherId,
      name: "Period 3 — Earth Science",
      joinCode: generateJoinCode(),
      joinCodeExpiresAt: joinCodeExpiry(),
    },
  });

  await prisma.rosterEntry.createMany({
    data: [
      { tenantId, classId: homeroom.id, name: "Avery Kim", email: "avery.kim@example.com" },
      { tenantId, classId: homeroom.id, name: "Jordan Patel", email: "jordan.patel@example.com" },
      { tenantId, classId: homeroom.id, name: "Sam Rivera", email: null },
    ],
  });

  const afterSchool = await prisma.class.create({
    data: {
      tenantId,
      teacherId,
      name: "After-School Coding Club",
      joinCode: generateJoinCode(),
      joinCodeExpiresAt: joinCodeExpiry(),
    },
  });

  await prisma.rosterEntry.createMany({
    data: [
      { tenantId, classId: afterSchool.id, name: "Riley Chen", email: "riley.chen@example.com" },
      { tenantId, classId: afterSchool.id, name: "Morgan Diaz", email: null },
    ],
  });

  console.log("Seeded demo classes:");
  console.log(`  ${homeroom.name} (join code ${homeroom.joinCode})`);
  console.log(`  ${afterSchool.name} (join code ${afterSchool.joinCode})`);
}

/**
 * Fictional, curriculum-plausible demo questions covering all 5
 * locked question types, so the question-bank screenshot shows
 * varied real content rather than one type repeated. Idempotent the
 * same way seedDemoClasses is — skips entirely if the teacher already
 * has questions, so re-running the seed script never duplicates rows.
 */
async function seedDemoQuestions(prisma: PrismaClient, tenantId: string, teacherId: string): Promise<void> {
  const existingQuestions = await prisma.question.count({ where: { tenantId, teacherId } });
  if (existingQuestions > 0) {
    console.log("Demo questions already exist; skipping.");
    return;
  }

  type SeedQuestion = Parameters<typeof createSeedQuestion>[3];

  const questions: SeedQuestion[] = [
    {
      type: "single_choice",
      prompt: "Which planet is known as the Red Planet?",
      points: 1,
      options: [
        { id: "a", text: "Venus" },
        { id: "b", text: "Mars" },
        { id: "c", text: "Jupiter" },
      ],
      correctAnswer: "b",
      hint: "It's named after the Roman god of war.",
    },
    {
      type: "multiple_choice",
      prompt: "Which of the following are prime numbers?",
      points: 2,
      options: [
        { id: "a", text: "2" },
        { id: "b", text: "4" },
        { id: "c", text: "7" },
        { id: "d", text: "9" },
      ],
      correctAnswer: ["a", "c"],
    },
    {
      type: "true_false",
      prompt: "The Earth revolves around the Sun.",
      points: 1,
      correctAnswer: true,
    },
    {
      type: "short_text",
      prompt: "What is the chemical symbol for water?",
      points: 1,
      correctAnswer: ["H2O", "h2o"],
      explanation: "Water is composed of two hydrogen atoms and one oxygen atom.",
    },
    {
      type: "numeric",
      prompt: "What is the boiling point of water at sea level, in Celsius?",
      points: 1,
      correctAnswer: { value: 100, tolerance: 1 },
    },
  ];

  for (const question of questions) {
    await createSeedQuestion(prisma, tenantId, teacherId, question);
  }

  console.log(`Seeded ${questions.length} demo questions (one per question type).`);
}

async function createSeedQuestion(
  prisma: PrismaClient,
  tenantId: string,
  teacherId: string,
  question: {
    type: "single_choice" | "multiple_choice" | "true_false" | "short_text" | "numeric";
    prompt: string;
    points: number;
    options?: { id: string; text: string }[];
    correctAnswer: unknown;
    hint?: string;
    explanation?: string;
  },
): Promise<void> {
  const created = await prisma.question.create({
    data: { tenantId, teacherId },
  });

  const version = await prisma.questionVersion.create({
    data: {
      questionId: created.id,
      tenantId,
      versionNumber: 1,
      type: question.type,
      prompt: question.prompt,
      points: question.points,
      hint: question.hint ?? null,
      explanation: question.explanation ?? null,
      options: question.options ?? undefined,
      correctAnswer: question.correctAnswer as never,
    },
  });

  await prisma.question.update({
    where: { id: created.id },
    data: { currentVersionId: version.id },
  });
}

/**
 * Fictional concepts matching the 5 seed questions' subject matter,
 * each tagged onto the question(s) it applies to via a real
 * `QuestionConcept` row (not a hand-rolled shortcut — the same shape
 * `PATCH /questions/:id/concepts` produces). Idempotent the same way
 * as the other seed helpers: skips entirely if the teacher already
 * has any concept.
 */
async function seedDemoConcepts(prisma: PrismaClient, tenantId: string, teacherId: string): Promise<void> {
  const existingConcepts = await prisma.concept.count({ where: { tenantId, teacherId } });
  if (existingConcepts > 0) {
    console.log("Demo concepts already exist; skipping.");
    return;
  }

  const questions = await prisma.question.findMany({
    where: { tenantId, teacherId, archivedAt: null },
    orderBy: { createdAt: "asc" },
    include: { currentVersion: true },
  });
  if (questions.length < 5) {
    console.log("Fewer than 5 demo questions found; skipping demo concepts.");
    return;
  }

  const [planetQuestion, primeQuestion, earthSunQuestion, waterQuestion, boilingQuestion] = questions;

  const solarSystem = await prisma.concept.create({
    data: { tenantId, teacherId, name: "Solar System Basics", description: "Planets and their place in the solar system." },
  });
  const numberTheory = await prisma.concept.create({
    data: { tenantId, teacherId, name: "Number Theory", description: "Prime numbers and basic number classification." },
  });
  const matterAndChemistry = await prisma.concept.create({
    data: { tenantId, teacherId, name: "States of Matter & Chemistry", description: "Chemical formulas and phase-change properties of water." },
  });

  await prisma.questionConcept.createMany({
    data: [
      { tenantId, questionId: planetQuestion.id, conceptId: solarSystem.id },
      { tenantId, questionId: earthSunQuestion.id, conceptId: solarSystem.id },
      { tenantId, questionId: primeQuestion.id, conceptId: numberTheory.id },
      { tenantId, questionId: waterQuestion.id, conceptId: matterAndChemistry.id },
      { tenantId, questionId: boilingQuestion.id, conceptId: matterAndChemistry.id },
    ],
  });

  console.log("Seeded demo concepts:");
  console.log(`  ${solarSystem.name} (2 questions tagged)`);
  console.log(`  ${numberTheory.name} (1 question tagged)`);
  console.log(`  ${matterAndChemistry.name} (2 questions tagged)`);
}

/**
 * One draft and one published demo activity, built from the questions
 * `seedDemoQuestions` already created (reused by id, no duplicate
 * seed questions). Idempotent the same way as the other seed helpers
 * — skips entirely if the teacher already has any activity, so
 * re-running the seed script never duplicates rows.
 */
async function seedDemoActivities(prisma: PrismaClient, tenantId: string, teacherId: string): Promise<void> {
  const existingActivities = await prisma.activity.count({ where: { tenantId, teacherId } });
  if (existingActivities > 0) {
    console.log("Demo activities already exist; skipping.");
    return;
  }

  const questions = await prisma.question.findMany({
    where: { tenantId, teacherId, archivedAt: null },
    orderBy: { createdAt: "asc" },
  });

  if (questions.length === 0) {
    console.log("No demo questions found; skipping demo activities.");
    return;
  }

  const draft = await prisma.activity.create({
    data: { tenantId, teacherId, title: "Draft: Solar System & Numbers Review", status: "draft" },
  });
  await prisma.activityQuestion.createMany({
    data: questions.slice(0, 3).map((q, index) => ({
      tenantId,
      activityId: draft.id,
      questionId: q.id,
      order: index,
    })),
  });

  const published = await prisma.activity.create({
    data: {
      tenantId,
      teacherId,
      title: "Published: Science & Math Fundamentals",
      status: "published",
      publishedAt: new Date(),
    },
  });
  const publishedQuestions = questions.slice(0, Math.min(5, questions.length));
  await prisma.$transaction(
    publishedQuestions.map((q, index) =>
      prisma.activityQuestion.create({
        data: {
          tenantId,
          activityId: published.id,
          questionId: q.id,
          order: index,
          pinnedVersionId: q.currentVersionId,
        },
      }),
    ),
  );

  // A second, narrower published activity covering only the two Solar
  // System Basics questions (planet + Earth/Sun) — used by
  // `seedDemoAdditionalMasteryAttempts` for two more submitted
  // assignments so that concept genuinely reaches Mastered under the
  // evidence-gated model (3+ distinct attempts), without also
  // touching Number Theory's single evidence row, which the demo
  // quest (`seedDemoQuest`) deliberately relies on staying short of
  // Proficient.
  let solarSystemCheck: { id: string; title: string } | null = null;
  if (questions.length >= 3) {
    solarSystemCheck = await prisma.activity.create({
      data: {
        tenantId,
        teacherId,
        title: "Published: Solar System Mastery Check",
        status: "published",
        publishedAt: new Date(),
      },
    });
    const solarQuestions = [questions[0], questions[2]];
    await prisma.$transaction(
      solarQuestions.map((q, index) =>
        prisma.activityQuestion.create({
          data: {
            tenantId,
            activityId: solarSystemCheck!.id,
            questionId: q.id,
            order: index,
            pinnedVersionId: q.currentVersionId,
          },
        }),
      ),
    );
  }

  console.log("Seeded demo activities:");
  console.log(`  ${draft.title} (draft, ${Math.min(3, questions.length)} questions)`);
  console.log(`  ${published.title} (published, ${publishedQuestions.length} questions)`);
  if (solarSystemCheck) {
    console.log(`  ${solarSystemCheck.title} (published, 2 questions)`);
  }
}

/**
 * Idempotent the same way as the other seed helpers: skips entirely
 * if the demo learner already exists. Returns the learner row (found
 * or freshly created) so `seedDemoAssignmentAndAttempt` can use its
 * id without a second lookup, or `null` if lookup/creation somehow
 * fails to produce a usable row.
 */
async function seedDemoLearner(
  prisma: PrismaClient,
  tenantId: string,
): Promise<{ id: string; name: string; email: string } | null> {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_LEARNER_EMAIL } });
  if (existing) {
    console.log(`Demo learner already exists (${DEMO_LEARNER_EMAIL}).`);
    return existing;
  }

  const passwordHash = await argon2.hash(DEMO_LEARNER_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const learner = await prisma.user.create({
    data: {
      tenantId,
      email: DEMO_LEARNER_EMAIL,
      name: DEMO_LEARNER_NAME,
      passwordHash,
      role: "learner",
      // Learners skip the email-verification gate (Module 5 decision)
      // — a valid join code is the trust proxy instead.
      emailVerifiedAt: new Date(),
    },
  });

  console.log("Seeded demo learner account:");
  console.log(`  email:    ${learner.email}`);
  console.log(`  password: ${DEMO_LEARNER_PASSWORD} (development only)`);

  return learner;
}

/** A plausible "correct" response for a pinned question version. */
function correctResponseFor(version: { type: string; correctAnswer: unknown }): unknown {
  return version.correctAnswer;
}

/** A plausible but wrong response, shaped correctly for the type. */
function wrongResponseFor(version: {
  type: string;
  correctAnswer: unknown;
  options: unknown;
}): unknown {
  switch (version.type) {
    case "single_choice": {
      const options = (version.options as { id: string }[] | null) ?? [];
      const wrong = options.find((o) => o.id !== version.correctAnswer);
      return wrong?.id ?? version.correctAnswer;
    }
    case "multiple_choice": {
      const correct = Array.isArray(version.correctAnswer) ? (version.correctAnswer as string[]) : [];
      // Omit one correct option — a common, realistic partial-credit mistake.
      return correct.slice(0, Math.max(correct.length - 1, 0));
    }
    case "true_false":
      return !version.correctAnswer;
    case "short_text":
      return "an incorrect answer";
    case "numeric": {
      const answer = version.correctAnswer as { value: number };
      return (answer?.value ?? 0) + 50;
    }
    default:
      return null;
  }
}

/**
 * One assignment (the seeded published activity, assigned to the
 * "Period 3 — Earth Science" class, due in the future) plus one
 * already-submitted attempt for the demo learner with a real computed
 * score — not a hardcoded number — so the dashboard/result screenshots
 * show genuine populated content. Idempotent on whether the demo
 * teacher already has any assignment at all.
 */
async function seedDemoAssignmentAndAttempt(
  prisma: PrismaClient,
  tenantId: string,
  teacherId: string,
  learner: { id: string; name: string; email: string },
): Promise<void> {
  const existingAssignments = await prisma.assignment.count({ where: { tenantId, teacherId } });
  if (existingAssignments > 0) {
    console.log("Demo assignment already exists; skipping.");
    return;
  }

  const homeroom = await prisma.class.findFirst({
    where: { tenantId, teacherId, name: "Period 3 — Earth Science" },
  });
  const publishedActivity = await prisma.activity.findFirst({
    where: { tenantId, teacherId, status: "published" },
    include: {
      questions: { orderBy: { order: "asc" }, include: { pinnedVersion: true } },
    },
  });

  if (!homeroom || !publishedActivity) {
    console.log("Missing prerequisite demo class/activity; skipping demo assignment.");
    return;
  }

  // Enroll the learner the same shape join-code redemption produces:
  // a real RosterEntry with userId set, not a teacher-added
  // placeholder.
  const existingRoster = await prisma.rosterEntry.findFirst({
    where: { classId: homeroom.id, userId: learner.id },
  });
  if (!existingRoster) {
    await prisma.rosterEntry.create({
      data: {
        tenantId,
        classId: homeroom.id,
        userId: learner.id,
        name: learner.name,
        email: learner.email,
      },
    });
  }

  const assignment = await prisma.assignment.create({
    data: {
      tenantId,
      teacherId,
      classId: homeroom.id,
      activityId: publishedActivity.id,
      dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const attempt = await prisma.attempt.create({
    data: {
      tenantId,
      assignmentId: assignment.id,
      learnerId: learner.id,
      status: "submitted",
      submittedAt: new Date(),
    },
  });

  const graded: { pointsAwarded: number; points: number }[] = [];
  const gradedForEvidence: {
    attemptResponseId: string;
    questionId: string;
    pointsAwarded: number;
    points: number;
    hintViewed: boolean;
  }[] = [];

  for (const [index, aq] of publishedActivity.questions.entries()) {
    const version = aq.pinnedVersion;
    if (!version) continue;

    // Answer every question correctly except the second, so the
    // seeded score is a realistic partial result rather than a flat
    // 100% — more useful for a screenshot. The third question is
    // marked hint-viewed so the seeded mastery evidence exercises the
    // 15% hint penalty too, not just the plain fraction.
    const response = index === 1 ? wrongResponseFor(version) : correctResponseFor(version);
    const hintViewed = index === 2;
    const result = scoreQuestion(
      { type: version.type, points: version.points, options: version.options, correctAnswer: version.correctAnswer },
      response,
    );

    const created = await prisma.attemptResponse.create({
      data: {
        tenantId,
        attemptId: attempt.id,
        activityQuestionId: aq.id,
        responseValue: response as never,
        isCorrect: result.isCorrect,
        pointsAwarded: result.pointsAwarded,
        hintViewed,
      },
    });

    graded.push({ pointsAwarded: result.pointsAwarded, points: version.points });
    gradedForEvidence.push({
      attemptResponseId: created.id,
      questionId: aq.questionId,
      pointsAwarded: result.pointsAwarded,
      points: version.points,
      hintViewed,
    });
  }

  const score = overallScore(graded);
  await prisma.attempt.update({ where: { id: attempt.id }, data: { score } });

  // Routes the seeded attempt through the REAL evidence-recording
  // logic (the same `MasteryService.recordEvidenceForAttempt` that
  // `AttemptsService.submit()` calls inside its grading transaction),
  // not a hand-rolled duplicate — so the demo has genuine mastery
  // data. `recordEvidenceForAttempt` only touches its `tx` argument,
  // so the plain (non-transactional) PrismaClient works fine here.
  const masteryService = new MasteryService(prisma as never);
  const touchedConceptIds = await masteryService.recordEvidenceForAttempt(
    prisma as unknown as Prisma.TransactionClient,
    { tenantId, learnerId: learner.id },
    gradedForEvidence,
  );

  // Routes the seeded attempt through the REAL award logic (Module 7)
  // too — the same `GamificationService.awardForAttempt` that
  // `AttemptsService.submit()` calls right after mastery recording —
  // so the demo learner's /xp page shows genuine XP and, since this
  // is their first submitted attempt, a real quest_starter badge.
  const totalAwardedPoints = graded.reduce((sum, g) => sum + g.pointsAwarded, 0);
  const gamificationService = new GamificationService(prisma as never, masteryService);
  await gamificationService.awardForAttempt(
    prisma as unknown as Prisma.TransactionClient,
    { tenantId, learnerId: learner.id },
    { attemptId: attempt.id, totalAwardedPoints, score, touchedConceptIds },
  );

  console.log(
    `Seeded demo assignment (${publishedActivity.title} -> ${homeroom.name}) and one submitted attempt (score ${Math.round(score * 100)}%).`,
  );
  console.log("Recorded mastery evidence and gamification XP/badges via the real grading-time recording path.");
}

/**
 * Two more submitted attempts on the narrower "Solar System Mastery
 * Check" activity (`seedDemoActivities`), each fully correct with no
 * hint, via the same real grading-time recording path as
 * `seedDemoAssignmentAndAttempt`. Combined with that first attempt's
 * two Solar System Basics evidence rows, this gives the concept 6
 * evidence rows across 3 distinct attempts — clearing the
 * evidence-gated model's Mastered minimums (4 evidence rows, 3
 * distinct attempts) with a genuinely high recency-weighted score, so
 * the demo has one real Mastered concept reached entirely through the
 * grading path, never a hand-inserted `MasteryEvidence` row.
 * Idempotent on the count of assignments already made against this
 * activity.
 */
async function seedDemoAdditionalMasteryAttempts(
  prisma: PrismaClient,
  tenantId: string,
  teacherId: string,
  learner: { id: string; name: string; email: string },
): Promise<void> {
  const homeroom = await prisma.class.findFirst({
    where: { tenantId, teacherId, name: "Period 3 — Earth Science" },
  });
  const solarActivity = await prisma.activity.findFirst({
    where: { tenantId, teacherId, title: "Published: Solar System Mastery Check" },
    include: { questions: { orderBy: { order: "asc" }, include: { pinnedVersion: true } } },
  });

  if (!homeroom || !solarActivity) {
    console.log("Missing prerequisite demo class/activity; skipping additional mastery attempts.");
    return;
  }

  const attemptsNeeded = 2;
  const existingAssignments = await prisma.assignment.count({
    where: { tenantId, teacherId, activityId: solarActivity.id },
  });
  if (existingAssignments >= attemptsNeeded) {
    console.log("Additional demo mastery attempts already exist; skipping.");
    return;
  }

  const masteryService = new MasteryService(prisma as never);
  const gamificationService = new GamificationService(prisma as never, masteryService);

  for (let i = existingAssignments; i < attemptsNeeded; i++) {
    const assignment = await prisma.assignment.create({
      data: {
        tenantId,
        teacherId,
        classId: homeroom.id,
        activityId: solarActivity.id,
        dueAt: new Date(Date.now() + (7 + i) * 24 * 60 * 60 * 1000),
      },
    });

    const attempt = await prisma.attempt.create({
      data: { tenantId, assignmentId: assignment.id, learnerId: learner.id, status: "submitted", submittedAt: new Date() },
    });

    const graded: { pointsAwarded: number; points: number }[] = [];
    const gradedForEvidence: {
      attemptResponseId: string;
      questionId: string;
      pointsAwarded: number;
      points: number;
      hintViewed: boolean;
    }[] = [];

    for (const aq of solarActivity.questions) {
      const version = aq.pinnedVersion;
      if (!version) continue;

      const response = correctResponseFor(version);
      const result = scoreQuestion(
        { type: version.type, points: version.points, options: version.options, correctAnswer: version.correctAnswer },
        response,
      );

      const created = await prisma.attemptResponse.create({
        data: {
          tenantId,
          attemptId: attempt.id,
          activityQuestionId: aq.id,
          responseValue: response as never,
          isCorrect: result.isCorrect,
          pointsAwarded: result.pointsAwarded,
          hintViewed: false,
        },
      });

      graded.push({ pointsAwarded: result.pointsAwarded, points: version.points });
      gradedForEvidence.push({
        attemptResponseId: created.id,
        questionId: aq.questionId,
        pointsAwarded: result.pointsAwarded,
        points: version.points,
        hintViewed: false,
      });
    }

    const score = overallScore(graded);
    await prisma.attempt.update({ where: { id: attempt.id }, data: { score } });

    const touchedConceptIds = await masteryService.recordEvidenceForAttempt(
      prisma as unknown as Prisma.TransactionClient,
      { tenantId, learnerId: learner.id },
      gradedForEvidence,
    );

    const totalAwardedPoints = graded.reduce((sum, g) => sum + g.pointsAwarded, 0);
    await gamificationService.awardForAttempt(
      prisma as unknown as Prisma.TransactionClient,
      { tenantId, learnerId: learner.id },
      { attemptId: attempt.id, totalAwardedPoints, score, touchedConceptIds },
    );
  }

  console.log(
    `Seeded ${attemptsNeeded} additional submitted attempts on "${solarActivity.title}" so Solar System Basics genuinely reaches Mastered under the evidence-gated model.`,
  );
}

/**
 * A 2-step demo quest for the Module 8 checkpoint (§14: quest builder
 * + learner quest map). Deliberately references the SAME published
 * activity and "Number Theory" concept the demo learner's seeded
 * attempt (`seedDemoAssignmentAndAttempt`) already answered — that
 * attempt answered the Number Theory question wrong, so this quest's
 * two steps land in genuinely different, screenshot-worthy states:
 * step 1 (activity completion) already complete, step 2 (mastery
 * threshold) unlocked but not yet met. Nothing is hand-set here —
 * both states are live-computed the same way a real learner's
 * progress would be, off the mastery evidence and attempt the earlier
 * seed steps already recorded through the real grading-time paths.
 * Idempotent on whether the demo teacher already has any quest.
 */
async function seedDemoQuest(prisma: PrismaClient, tenantId: string, teacherId: string): Promise<void> {
  const existingQuests = await prisma.quest.count({ where: { tenantId, teacherId } });
  if (existingQuests > 0) {
    console.log("Demo quest already exists; skipping.");
    return;
  }

  const publishedActivity = await prisma.activity.findFirst({
    where: { tenantId, teacherId, status: "published" },
  });
  const numberTheory = await prisma.concept.findFirst({
    where: { tenantId, teacherId, name: "Number Theory" },
  });

  if (!publishedActivity || !numberTheory) {
    console.log("Missing prerequisite demo activity/concept; skipping demo quest.");
    return;
  }

  const quest = await prisma.quest.create({
    data: {
      tenantId,
      teacherId,
      title: "Science & Math Explorer",
      description: "Complete the fundamentals quiz, then sharpen your number theory skills.",
    },
  });

  await prisma.questStep.createMany({
    data: [
      { tenantId, questId: quest.id, order: 1, activityId: publishedActivity.id },
      {
        tenantId,
        questId: quest.id,
        order: 2,
        requiredConceptId: numberTheory.id,
        requiredMasteryState: "proficient",
      },
    ],
  });

  console.log(`Seeded demo quest: ${quest.title} (2 steps).`);
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
