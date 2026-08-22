import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "../support/test-app";
import { PrismaService } from "../../src/prisma/prisma.service";
import * as argon2 from "argon2";

/**
 * Drives the real HTTP surface: teacher CRUD for quests/steps
 * (including cross-field gate validation), tenant isolation, and the
 * full gating-correctness flow — a 3-step quest with an activity-only
 * step, a mastery-only step, and a combined (AND) step — proving the
 * unlock cursor and completion reward fire at exactly the right
 * moments, driven entirely by real Attempt submissions and mastery
 * evidence, never by directly poking quest state.
 */
describe("quests: CRUD, tenant isolation, and gating (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const teacherEmail = `quests-teacher-${Date.now()}@example.com`;
  const password = "correcthorse123";
  let teacherToken: string;
  let tenantId: string;
  let classId: string;
  let joinCode: string;

  const questionIds: string[] = [];
  const activityIds: string[] = [];
  const assignmentIds: string[] = [];
  let conceptId: string;
  let questId: string;

  function teacherAuth() {
    return { Authorization: `Bearer ${teacherToken}` };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const tenant = await prisma.tenant.create({ data: { name: "Quests Tenant" } });
    tenantId = tenant.id;
    const teacher = await prisma.user.create({
      data: { tenantId: tenant.id, email: teacherEmail, name: "Teacher", passwordHash, emailVerifiedAt: new Date() },
    });
    const login = await request(app.getHttpServer()).post("/auth/login").send({ email: teacher.email, password }).expect(200);
    teacherToken = login.body.accessToken;

    const cls = await request(app.getHttpServer()).post("/classes").set(teacherAuth()).send({ name: "Quests Class" }).expect(201);
    classId = cls.body.id;
    joinCode = cls.body.joinCode;

    const concept = await request(app.getHttpServer())
      .post("/concepts")
      .set(teacherAuth())
      .send({ name: "Quest Gating Concept" })
      .expect(201);
    conceptId = concept.body.id;
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

  async function createPublishedActivity(title: string, taggedConceptId?: string, questionCount = 1) {
    const questionIdsForActivity: string[] = [];
    for (let i = 0; i < questionCount; i++) {
      const q = await request(app.getHttpServer())
        .post("/questions")
        .set(teacherAuth())
        .send({
          type: "single_choice",
          prompt: `${title} prompt ${i}`,
          points: 2,
          options: [{ id: "x", text: "wrong" }, { id: "y", text: "right" }],
          correctAnswer: "y",
        })
        .expect(201);
      questionIds.push(q.body.id);
      questionIdsForActivity.push(q.body.id);

      if (taggedConceptId) {
        await request(app.getHttpServer())
          .patch(`/questions/${q.body.id}/concepts`)
          .set(teacherAuth())
          .send({ conceptIds: [taggedConceptId] })
          .expect(200);
      }
    }

    const activity = await request(app.getHttpServer()).post("/activities").set(teacherAuth()).send({ title }).expect(201);
    activityIds.push(activity.body.id);
    for (const questionId of questionIdsForActivity) {
      await request(app.getHttpServer()).post(`/activities/${activity.body.id}/questions`).set(teacherAuth()).send({ questionId }).expect(201);
    }
    await request(app.getHttpServer()).post(`/activities/${activity.body.id}/publish`).set(teacherAuth()).expect(200);

    const assignment = await request(app.getHttpServer())
      .post("/assignments")
      .set(teacherAuth())
      .send({ classId, activityId: activity.body.id, dueAt: new Date(Date.now() + 86400000).toISOString() })
      .expect(201);
    assignmentIds.push(assignment.body.id);

    return { activityId: activity.body.id, assignmentId: assignment.body.id };
  }

  async function submitCorrectly(learnerAuth: { Authorization: string }, assignmentId: string) {
    const started = await request(app.getHttpServer()).post(`/assignments/${assignmentId}/attempts/start`).set(learnerAuth).expect(200);
    for (const question of started.body.questions) {
      await request(app.getHttpServer())
        .patch(`/attempts/${started.body.id}/responses/${question.activityQuestionId}`)
        .set(learnerAuth)
        .send({ responseValue: "y" })
        .expect(200);
    }
    return request(app.getHttpServer()).post(`/attempts/${started.body.id}/submit`).set(learnerAuth).expect(200);
  }

  // -----------------------------------------------------------------
  // CRUD + validation
  // -----------------------------------------------------------------

  it("creates a quest owned by the teacher", async () => {
    const res = await request(app.getHttpServer()).post("/quests").set(teacherAuth()).send({ title: "Marine Explorer" }).expect(201);
    questId = res.body.id;
    expect(res.body.title).toBe("Marine Explorer");
    expect(res.body.steps).toEqual([]);
  });

  it("rejects a step with neither an activity nor a mastery gate", async () => {
    await request(app.getHttpServer()).post(`/quests/${questId}/steps`).set(teacherAuth()).send({}).expect(400);
  });

  it("rejects a mastery gate with a concept but no required state", async () => {
    await request(app.getHttpServer())
      .post(`/quests/${questId}/steps`)
      .set(teacherAuth())
      .send({ requiredConceptId: conceptId })
      .expect(400);
  });

  it("rejects an activityId that references a DRAFT (unpublished) activity", async () => {
    const draft = await request(app.getHttpServer()).post("/activities").set(teacherAuth()).send({ title: "Still drafting" }).expect(201);
    await request(app.getHttpServer())
      .post(`/quests/${questId}/steps`)
      .set(teacherAuth())
      .send({ activityId: draft.body.id })
      .expect(400);
    await prisma.activity.deleteMany({ where: { id: draft.body.id } });
  });

  it("reorder rejects a list that doesn't match the quest's current step set", async () => {
    await request(app.getHttpServer()).patch(`/quests/${questId}/steps/reorder`).set(teacherAuth()).send({ stepIds: ["nonexistent-id"] }).expect(400);
  });

  it("a cross-tenant teacher cannot read, update, or archive another tenant's quest (404, not 403)", async () => {
    const outsiderEmail = `quests-outsider-${Date.now()}@example.com`;
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const outsiderTenant = await prisma.tenant.create({ data: { name: "Outsider Tenant" } });
    const outsider = await prisma.user.create({
      data: { tenantId: outsiderTenant.id, email: outsiderEmail, name: "Outsider", passwordHash, emailVerifiedAt: new Date() },
    });
    const login = await request(app.getHttpServer()).post("/auth/login").send({ email: outsider.email, password }).expect(200);
    const outsiderAuth = { Authorization: `Bearer ${login.body.accessToken}` };

    await request(app.getHttpServer()).get(`/quests/${questId}`).set(outsiderAuth).expect(404);
    await request(app.getHttpServer()).patch(`/quests/${questId}`).set(outsiderAuth).send({ title: "Hijacked" }).expect(404);
    await request(app.getHttpServer()).delete(`/quests/${questId}`).set(outsiderAuth).expect(404);

    await prisma.user.deleteMany({ where: { email: outsiderEmail } });
    await prisma.tenant.deleteMany({ where: { id: outsiderTenant.id } });
  });

  // -----------------------------------------------------------------
  // Gating correctness + full completion flow
  // -----------------------------------------------------------------

  let step1AssignmentId: string;
  let step2AssignmentIds: string[];
  let step3AssignmentId: string;
  let learnerAuth: { Authorization: string };
  let learnerId: string;

  it("builds a 3-step quest: activity-only, mastery-only (mastered via 3 distinct attempts), combined (activity AND mastery)", async () => {
    const step1 = await createPublishedActivity("Quest Step 1 Activity");
    step1AssignmentId = step1.assignmentId;

    // Reaching "mastered" now requires >= 4 evidence rows spanning
    // >= 3 distinct attempts (Module 10.2 evidence-gated model), not
    // just a single high-scoring submission — so the mastery source
    // is 3 separate published activities/assignments, all tagged with
    // the same concept (source A has 2 tagged questions so 3 attempts
    // yield 4 evidence rows total), each to be answered correctly in
    // its own attempt.
    const sourceA = await createPublishedActivity("Quest Step 2 Mastery Source A", conceptId, 2);
    const sourceB = await createPublishedActivity("Quest Step 2 Mastery Source B", conceptId);
    const sourceC = await createPublishedActivity("Quest Step 2 Mastery Source C", conceptId);
    step2AssignmentIds = [sourceA.assignmentId, sourceB.assignmentId, sourceC.assignmentId];

    const step3 = await createPublishedActivity("Quest Step 3 Activity", conceptId);
    step3AssignmentId = step3.assignmentId;

    await request(app.getHttpServer()).post(`/quests/${questId}/steps`).set(teacherAuth()).send({ activityId: step1.activityId }).expect(201);
    await request(app.getHttpServer())
      .post(`/quests/${questId}/steps`)
      .set(teacherAuth())
      .send({ requiredConceptId: conceptId, requiredMasteryState: "mastered" })
      .expect(201);
    const withStep3 = await request(app.getHttpServer())
      .post(`/quests/${questId}/steps`)
      .set(teacherAuth())
      .send({ activityId: step3.activityId, requiredConceptId: conceptId, requiredMasteryState: "proficient" })
      .expect(201);
    expect(withStep3.body.steps).toHaveLength(3);
  });

  it("learner joins: quest shows only step 1 unlocked, nothing complete", async () => {
    const learnerEmail = `quests-learner-${Date.now()}@example.com`;
    const joined = await request(app.getHttpServer())
      .post("/classes/join")
      .send({ joinCode, name: "Quest Learner", email: learnerEmail, password: "learnerpassword123" })
      .expect(200);
    learnerAuth = { Authorization: `Bearer ${joined.body.accessToken}` };
    learnerId = (await prisma.user.findUniqueOrThrow({ where: { email: learnerEmail } })).id;

    const progress = await request(app.getHttpServer()).get(`/quests/${questId}`).set(learnerAuth).expect(200);
    expect(progress.body.complete).toBe(false);
    expect(progress.body.steps[0].unlocked).toBe(true);
    expect(progress.body.steps[0].complete).toBe(false);
    expect(progress.body.steps[1].unlocked).toBe(false);
    expect(progress.body.steps[2].unlocked).toBe(false);
  });

  it("completing step 1's activity unlocks step 2 but the quest is not complete", async () => {
    await submitCorrectly(learnerAuth, step1AssignmentId);
    const progress = await request(app.getHttpServer()).get(`/quests/${questId}`).set(learnerAuth).expect(200);
    expect(progress.body.steps[0].complete).toBe(true);
    expect(progress.body.steps[1].unlocked).toBe(true);
    expect(progress.body.steps[1].complete).toBe(false); // no mastery evidence yet
    expect(progress.body.complete).toBe(false);
  });

  it("two of the three needed distinct attempts is NOT enough to reach 'mastered' (evidence/attempt gate)", async () => {
    await submitCorrectly(learnerAuth, step2AssignmentIds[0]);
    await submitCorrectly(learnerAuth, step2AssignmentIds[1]);

    const progress = await request(app.getHttpServer()).get(`/quests/${questId}`).set(learnerAuth).expect(200);
    // Score alone would already justify "mastered" from 2 perfect
    // attempts, but the gate requires >= 3 distinct attempts.
    expect(progress.body.steps[1].complete).toBe(false);
    expect(progress.body.complete).toBe(false);
  });

  it("a third distinct attempt genuinely reaches 'mastered' and completes step 2, but step 3 still needs its own activity", async () => {
    await submitCorrectly(learnerAuth, step2AssignmentIds[2]);

    const progress = await request(app.getHttpServer()).get(`/quests/${questId}`).set(learnerAuth).expect(200);
    expect(progress.body.steps[1].complete).toBe(true); // mastery gate satisfied
    expect(progress.body.steps[2].complete).toBe(false); // activity leg of the AND still missing
    expect(progress.body.complete).toBe(false);

    const completion = await prisma.questCompletion.findUnique({ where: { questId_learnerId: { questId, learnerId } } });
    expect(completion).toBeNull();
  });

  it("completing step 3's activity (mastery leg already satisfied) completes the quest and issues the reward exactly once", async () => {
    await submitCorrectly(learnerAuth, step3AssignmentId);

    const progress = await request(app.getHttpServer()).get(`/quests/${questId}`).set(learnerAuth).expect(200);
    expect(progress.body.steps.every((s: { complete: boolean }) => s.complete)).toBe(true);
    expect(progress.body.complete).toBe(true);
    expect(progress.body.xpAwarded).toBe(80); // 50 base + 10*3 steps

    const completions = await prisma.questCompletion.findMany({ where: { questId, learnerId } });
    expect(completions).toHaveLength(1);
    expect(completions[0].xpAwarded).toBe(80);
  });

  it("GET /quests (learner) reflects the completed quest in the tenant-wide list", async () => {
    const res = await request(app.getHttpServer()).get("/quests").set(learnerAuth).expect(200);
    const row = res.body.find((q: { id: string }) => q.id === questId);
    expect(row.complete).toBe(true);
    expect(row.xpAwarded).toBe(80);
    expect(row.unlockedStepCount).toBe(3);
  });
});
