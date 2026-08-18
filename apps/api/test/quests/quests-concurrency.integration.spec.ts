import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "../support/test-app";
import { PrismaService } from "../../src/prisma/prisma.service";
import * as argon2 from "argon2";

/**
 * Proves `QuestCompletion`'s idempotency under TRUE concurrency, and
 * specifically the concurrency risk that's DIFFERENT from
 * `XpTransaction`'s (see the doc comments on `QuestCompletion` in
 * schema.prisma and on `evaluateQuestProgressForAttempt`):
 * `XpTransaction`'s uniqueness is fail-loud because only the single
 * winning claim inside ONE attempt's `submit()` transaction can ever
 * reach that insert. A quest's last step has no such guarantee — it
 * can be satisfied by TWO DIFFERENT attempts' own evidence,
 * independently, in two genuinely separate transactions.
 *
 * The quest here has a SINGLE step, gated only on reaching "mastered"
 * on a concept tagged onto TWO different questions (in two different
 * activities). A single full-credit response is already enough
 * evidence to reach "mastered" on its own (score 1.0 >= 0.9), so each
 * of two concurrently-submitted attempts, working from only its OWN
 * newly-recorded evidence inside its OWN transaction, independently
 * concludes "the quest is now complete" — regardless of whether the
 * other transaction has committed yet. Both race to insert
 * `QuestCompletion`; the unique constraint + `skipDuplicates` must
 * let exactly one survive.
 */
describe("quest completion reward (concurrency proof)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const teacherEmail = `quests-concurrency-teacher-${Date.now()}@example.com`;
  const password = "correcthorse123";
  let teacherToken: string;
  let tenantId: string;
  let classId: string;
  let joinCode: string;
  let conceptId: string;
  let questId: string;

  const questionIds: string[] = [];
  const activityIds: string[] = [];
  const assignmentIds: string[] = [];

  function teacherAuth() {
    return { Authorization: `Bearer ${teacherToken}` };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const tenant = await prisma.tenant.create({ data: { name: "Quests Concurrency Tenant" } });
    tenantId = tenant.id;
    const teacher = await prisma.user.create({
      data: { tenantId: tenant.id, email: teacherEmail, name: "Teacher", passwordHash, emailVerifiedAt: new Date() },
    });
    const login = await request(app.getHttpServer()).post("/auth/login").send({ email: teacher.email, password }).expect(200);
    teacherToken = login.body.accessToken;

    const cls = await request(app.getHttpServer()).post("/classes").set(teacherAuth()).send({ name: "Quests Concurrency Class" }).expect(201);
    classId = cls.body.id;
    joinCode = cls.body.joinCode;

    const concept = await request(app.getHttpServer())
      .post("/concepts")
      .set(teacherAuth())
      .send({ name: "Concurrency Race Concept" })
      .expect(201);
    conceptId = concept.body.id;

    const quest = await request(app.getHttpServer())
      .post("/quests")
      .set(teacherAuth())
      .send({ title: "Single-Step Mastery Quest" })
      .expect(201);
    questId = quest.body.id;
    await request(app.getHttpServer())
      .post(`/quests/${questId}/steps`)
      .set(teacherAuth())
      .send({ requiredConceptId: conceptId, requiredMasteryState: "mastered" })
      .expect(201);

    // Two independent activities, each with one question tagged with
    // the same concept — either one alone gives a fresh learner
    // enough evidence (a single full-credit response) to reach
    // "mastered".
    for (const label of ["A", "B"]) {
      const q = await request(app.getHttpServer())
        .post("/questions")
        .set(teacherAuth())
        .send({
          type: "single_choice",
          prompt: `Race question ${label}`,
          points: 2,
          options: [{ id: "x", text: "wrong" }, { id: "y", text: "right" }],
          correctAnswer: "y",
        })
        .expect(201);
      questionIds.push(q.body.id);
      await request(app.getHttpServer()).patch(`/questions/${q.body.id}/concepts`).set(teacherAuth()).send({ conceptIds: [conceptId] }).expect(200);

      const activity = await request(app.getHttpServer()).post("/activities").set(teacherAuth()).send({ title: `Race Activity ${label}` }).expect(201);
      activityIds.push(activity.body.id);
      await request(app.getHttpServer()).post(`/activities/${activity.body.id}/questions`).set(teacherAuth()).send({ questionId: q.body.id }).expect(201);
      await request(app.getHttpServer()).post(`/activities/${activity.body.id}/publish`).set(teacherAuth()).expect(200);

      const assignment = await request(app.getHttpServer())
        .post("/assignments")
        .set(teacherAuth())
        .send({ classId, activityId: activity.body.id, dueAt: new Date(Date.now() + 86400000).toISOString() })
        .expect(201);
      assignmentIds.push(assignment.body.id);
    }
  });

  afterAll(async () => {
    if (assignmentIds.length > 0) {
      await prisma.attemptResponse.deleteMany({ where: { attempt: { assignmentId: { in: assignmentIds } } } });
      await prisma.masteryEvidence.deleteMany({ where: { attemptResponse: { attempt: { assignmentId: { in: assignmentIds } } } } });
      await prisma.attempt.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
      await prisma.assignment.deleteMany({ where: { id: { in: assignmentIds } } });
    }
    if (questId) {
      await prisma.questCompletion.deleteMany({ where: { questId } });
      await prisma.questStep.deleteMany({ where: { questId } });
      await prisma.quest.deleteMany({ where: { id: questId } });
    }
    if (activityIds.length > 0) {
      await prisma.activityQuestion.deleteMany({ where: { activityId: { in: activityIds } } });
      await prisma.activity.deleteMany({ where: { id: { in: activityIds } } });
    }
    if (questionIds.length > 0) {
      await prisma.questionConcept.deleteMany({ where: { questionId: { in: questionIds } } });
      await prisma.questionVersion.deleteMany({ where: { questionId: { in: questionIds } } });
      await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
    }
    if (conceptId) {
      await prisma.masteryEvidence.deleteMany({ where: { conceptId } });
      await prisma.concept.deleteMany({ where: { id: conceptId } });
    }
    if (classId) {
      await prisma.rosterEntry.deleteMany({ where: { classId } });
      await prisma.class.deleteMany({ where: { id: classId } });
    }
    await prisma.user.deleteMany({ where: { tenantId } });
    if (tenantId) {
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await app.close();
  });

  it("two concurrent, independently-sufficient attempts race to complete the same quest: exactly one QuestCompletion survives", async () => {
    const learnerEmail = `quests-race-learner-${Date.now()}@example.com`;
    const joined = await request(app.getHttpServer())
      .post("/classes/join")
      .send({ joinCode, name: "Race Learner", email: learnerEmail, password: "learnerpassword123" })
      .expect(200);
    const learnerAuth = { Authorization: `Bearer ${joined.body.accessToken}` };
    const learnerId = (await prisma.user.findUniqueOrThrow({ where: { email: learnerEmail } })).id;

    const startedA = await request(app.getHttpServer()).post(`/assignments/${assignmentIds[0]}/attempts/start`).set(learnerAuth).expect(200);
    const startedB = await request(app.getHttpServer()).post(`/assignments/${assignmentIds[1]}/attempts/start`).set(learnerAuth).expect(200);

    await request(app.getHttpServer())
      .patch(`/attempts/${startedA.body.id}/responses/${startedA.body.questions[0].activityQuestionId}`)
      .set(learnerAuth)
      .send({ responseValue: "y" })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/attempts/${startedB.body.id}/responses/${startedB.body.questions[0].activityQuestionId}`)
      .set(learnerAuth)
      .send({ responseValue: "y" })
      .expect(200);

    // Both attempts are pre-answered and ready; submit them at the
    // same time via Promise.all so their grading transactions
    // genuinely overlap, mirroring the concurrency proof already
    // established in gamification.integration.spec.ts and
    // mastery.integration.spec.ts.
    const [r1, r2] = await Promise.all([
      request(app.getHttpServer()).post(`/attempts/${startedA.body.id}/submit`).set(learnerAuth),
      request(app.getHttpServer()).post(`/attempts/${startedB.body.id}/submit`).set(learnerAuth),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const completions = await prisma.questCompletion.findMany({ where: { questId, learnerId } });
    expect(completions).toHaveLength(1);
    expect(completions[0].xpAwarded).toBe(60); // 50 base + 10*1 step

    // A third, sequential attempt against a fresh assignment of the
    // same already-mastered concept confirms this holds outside a
    // Promise.all race too, not just under it (mirrors the mastery
    // idempotency test's sequential follow-up check).
    const q3 = await request(app.getHttpServer())
      .post("/questions")
      .set(teacherAuth())
      .send({
        type: "single_choice",
        prompt: "Race question C (post-completion)",
        points: 2,
        options: [{ id: "x", text: "wrong" }, { id: "y", text: "right" }],
        correctAnswer: "y",
      })
      .expect(201);
    questionIds.push(q3.body.id);
    await request(app.getHttpServer()).patch(`/questions/${q3.body.id}/concepts`).set(teacherAuth()).send({ conceptIds: [conceptId] }).expect(200);
    const activityC = await request(app.getHttpServer()).post("/activities").set(teacherAuth()).send({ title: "Race Activity C" }).expect(201);
    activityIds.push(activityC.body.id);
    await request(app.getHttpServer()).post(`/activities/${activityC.body.id}/questions`).set(teacherAuth()).send({ questionId: q3.body.id }).expect(201);
    await request(app.getHttpServer()).post(`/activities/${activityC.body.id}/publish`).set(teacherAuth()).expect(200);
    const assignmentC = await request(app.getHttpServer())
      .post("/assignments")
      .set(teacherAuth())
      .send({ classId, activityId: activityC.body.id, dueAt: new Date(Date.now() + 86400000).toISOString() })
      .expect(201);
    assignmentIds.push(assignmentC.body.id);

    const startedC = await request(app.getHttpServer()).post(`/assignments/${assignmentC.body.id}/attempts/start`).set(learnerAuth).expect(200);
    await request(app.getHttpServer())
      .patch(`/attempts/${startedC.body.id}/responses/${startedC.body.questions[0].activityQuestionId}`)
      .set(learnerAuth)
      .send({ responseValue: "y" })
      .expect(200);
    await request(app.getHttpServer()).post(`/attempts/${startedC.body.id}/submit`).set(learnerAuth).expect(200);

    const completionsAfter = await prisma.questCompletion.findMany({ where: { questId, learnerId } });
    expect(completionsAfter).toHaveLength(1);
  });
});
