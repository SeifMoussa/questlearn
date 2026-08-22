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
 * The quest here has a SINGLE step, gated on reaching "mastered" on a
 * concept. Under the evidence-gated model (Module 10.2), "mastered"
 * requires evidence from >= 3 distinct attempts and >= 4 evidence
 * rows — a single full-credit response is no longer enough on its
 * own. So the race is staged as: two attempts (A: 2 tagged questions,
 * B: 1 tagged question) are submitted SEQUENTIALLY first, bringing
 * the concept to 3 evidence rows across 2 distinct attempts (short of
 * "mastered" — capped at "proficient"). Then two MORE attempts (C and
 * D, one tagged question each) are submitted CONCURRENTLY: each,
 * working from only its own newly-recorded evidence inside its own
 * transaction (existing 3 rows/2 attempts + its own 1 row), computes
 * 4 evidence rows across 3 distinct attempts — independently crossing
 * the "mastered" gate regardless of whether the other transaction has
 * committed yet. Both race to insert `QuestCompletion`; the unique
 * constraint + `skipDuplicates` must let exactly one survive.
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
  let raceAssignmentA: string;
  let raceAssignmentB: string;
  let raceAssignmentC: string;
  let raceAssignmentD: string;

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

    // Four independent activities, all with question(s) tagged with
    // the same concept: A has 2 tagged questions, B/C/D have 1 each.
    // A+B (submitted sequentially, before the race) bring the concept
    // to 3 evidence rows across 2 distinct attempts. C and D (raced
    // concurrently) each independently push it to 4 evidence rows
    // across 3 distinct attempts, crossing the "mastered" gate.
    async function createRaceActivity(label: string, taggedQuestionCount: number): Promise<string> {
      const activity = await request(app.getHttpServer()).post("/activities").set(teacherAuth()).send({ title: `Race Activity ${label}` }).expect(201);
      activityIds.push(activity.body.id);

      for (let i = 0; i < taggedQuestionCount; i++) {
        const q = await request(app.getHttpServer())
          .post("/questions")
          .set(teacherAuth())
          .send({
            type: "single_choice",
            prompt: `Race question ${label}-${i}`,
            points: 2,
            options: [{ id: "x", text: "wrong" }, { id: "y", text: "right" }],
            correctAnswer: "y",
          })
          .expect(201);
        questionIds.push(q.body.id);
        await request(app.getHttpServer()).patch(`/questions/${q.body.id}/concepts`).set(teacherAuth()).send({ conceptIds: [conceptId] }).expect(200);
        await request(app.getHttpServer()).post(`/activities/${activity.body.id}/questions`).set(teacherAuth()).send({ questionId: q.body.id }).expect(201);
      }

      await request(app.getHttpServer()).post(`/activities/${activity.body.id}/publish`).set(teacherAuth()).expect(200);

      const assignment = await request(app.getHttpServer())
        .post("/assignments")
        .set(teacherAuth())
        .send({ classId, activityId: activity.body.id, dueAt: new Date(Date.now() + 86400000).toISOString() })
        .expect(201);
      assignmentIds.push(assignment.body.id);
      return assignment.body.id;
    }

    raceAssignmentA = await createRaceActivity("A", 2);
    raceAssignmentB = await createRaceActivity("B", 1);
    raceAssignmentC = await createRaceActivity("C", 1);
    raceAssignmentD = await createRaceActivity("D", 1);
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

  async function startAnswerAndSubmit(learnerAuth: { Authorization: string }, assignmentId: string) {
    const started = await request(app.getHttpServer()).post(`/assignments/${assignmentId}/attempts/start`).set(learnerAuth).expect(200);
    for (const question of started.body.questions) {
      await request(app.getHttpServer())
        .patch(`/attempts/${started.body.id}/responses/${question.activityQuestionId}`)
        .set(learnerAuth)
        .send({ responseValue: "y" })
        .expect(200);
    }
    return started.body.id as string;
  }

  it("two concurrent, independently-sufficient attempts race to complete the same quest: exactly one QuestCompletion survives", async () => {
    const learnerEmail = `quests-race-learner-${Date.now()}@example.com`;
    const joined = await request(app.getHttpServer())
      .post("/classes/join")
      .send({ joinCode, name: "Race Learner", email: learnerEmail, password: "learnerpassword123" })
      .expect(200);
    const learnerAuth = { Authorization: `Bearer ${joined.body.accessToken}` };
    const learnerId = (await prisma.user.findUniqueOrThrow({ where: { email: learnerEmail } })).id;

    // A (2 evidence rows) and B (1 evidence row), submitted
    // sequentially: 3 evidence rows across 2 distinct attempts —
    // short of "mastered" (needs >= 4 rows / >= 3 attempts), capped
    // at "proficient".
    const attemptAId = await startAnswerAndSubmit(learnerAuth, raceAssignmentA);
    await request(app.getHttpServer()).post(`/attempts/${attemptAId}/submit`).set(learnerAuth).expect(200);
    const attemptBId = await startAnswerAndSubmit(learnerAuth, raceAssignmentB);
    await request(app.getHttpServer()).post(`/attempts/${attemptBId}/submit`).set(learnerAuth).expect(200);

    const preRaceProgress = await request(app.getHttpServer()).get(`/quests/${questId}`).set(learnerAuth).expect(200);
    expect(preRaceProgress.body.steps[0].complete).toBe(false);

    const attemptCId = await startAnswerAndSubmit(learnerAuth, raceAssignmentC);
    const attemptDId = await startAnswerAndSubmit(learnerAuth, raceAssignmentD);

    // Both attempts are pre-answered and ready; submit them at the
    // same time via Promise.all so their grading transactions
    // genuinely overlap, mirroring the concurrency proof already
    // established in gamification.integration.spec.ts and
    // mastery.integration.spec.ts. Each, from only its own
    // newly-recorded evidence, independently computes 4 evidence rows
    // across 3 distinct attempts (the pre-race 3 + its own 1) and
    // concludes the quest is now complete.
    const [r1, r2] = await Promise.all([
      request(app.getHttpServer()).post(`/attempts/${attemptCId}/submit`).set(learnerAuth),
      request(app.getHttpServer()).post(`/attempts/${attemptDId}/submit`).set(learnerAuth),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const completions = await prisma.questCompletion.findMany({ where: { questId, learnerId } });
    expect(completions).toHaveLength(1);
    expect(completions[0].xpAwarded).toBe(60); // 50 base + 10*1 step

    // A fourth, sequential attempt against a fresh assignment of the
    // same already-mastered concept confirms this holds outside a
    // Promise.all race too, not just under it (mirrors the mastery
    // idempotency test's sequential follow-up check).
    const raceAssignmentE = await (async () => {
      const q = await request(app.getHttpServer())
        .post("/questions")
        .set(teacherAuth())
        .send({
          type: "single_choice",
          prompt: "Race question E (post-completion)",
          points: 2,
          options: [{ id: "x", text: "wrong" }, { id: "y", text: "right" }],
          correctAnswer: "y",
        })
        .expect(201);
      questionIds.push(q.body.id);
      await request(app.getHttpServer()).patch(`/questions/${q.body.id}/concepts`).set(teacherAuth()).send({ conceptIds: [conceptId] }).expect(200);
      const activityE = await request(app.getHttpServer()).post("/activities").set(teacherAuth()).send({ title: "Race Activity E" }).expect(201);
      activityIds.push(activityE.body.id);
      await request(app.getHttpServer()).post(`/activities/${activityE.body.id}/questions`).set(teacherAuth()).send({ questionId: q.body.id }).expect(201);
      await request(app.getHttpServer()).post(`/activities/${activityE.body.id}/publish`).set(teacherAuth()).expect(200);
      const assignmentE = await request(app.getHttpServer())
        .post("/assignments")
        .set(teacherAuth())
        .send({ classId, activityId: activityE.body.id, dueAt: new Date(Date.now() + 86400000).toISOString() })
        .expect(201);
      assignmentIds.push(assignmentE.body.id);
      return assignmentE.body.id as string;
    })();

    const attemptEId = await startAnswerAndSubmit(learnerAuth, raceAssignmentE);
    await request(app.getHttpServer()).post(`/attempts/${attemptEId}/submit`).set(learnerAuth).expect(200);

    const completionsAfter = await prisma.questCompletion.findMany({ where: { questId, learnerId } });
    expect(completionsAfter).toHaveLength(1);
  });
});
