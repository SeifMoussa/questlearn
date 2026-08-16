import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "../support/test-app";
import { PrismaService } from "../../src/prisma/prisma.service";
import * as argon2 from "argon2";

/**
 * Drives the real HTTP surface: create a concept, tag a question with
 * it, grade an attempt for that question, confirm a MasteryEvidence
 * row exists with the correct responseScore/hintViewed, and confirm
 * GET /mastery/me reflects it. Also covers a two-concept tag (evidence
 * for both), the idempotency proof, recency-weighted decay (inserted
 * directly via Prisma with controlled recordedAt, since a real
 * submission can't time-travel), and hint-viewed tracking guards.
 */
describe("mastery evidence and query endpoints (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const teacherEmail = `mastery-teacher-${Date.now()}@example.com`;
  const password = "correcthorse123";
  let teacherToken: string;
  let tenantId: string;

  let classId: string;
  const questionIds: string[] = [];
  let activityId: string;
  let assignmentId: string;

  let conceptAId: string; // tagged on question 1 only
  let conceptBId: string; // tagged on question 1 AND question 2

  const learnerEmail = `mastery-learner-${Date.now()}@example.com`;
  let learnerToken: string;
  let learnerId: string;
  let attemptId: string;
  let aq1: string;
  let aq2: string;

  function teacherAuth() {
    return { Authorization: `Bearer ${teacherToken}` };
  }
  function learnerAuth() {
    return { Authorization: `Bearer ${learnerToken}` };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const tenant = await prisma.tenant.create({ data: { name: "Mastery Tenant" } });
    tenantId = tenant.id;
    const teacher = await prisma.user.create({
      data: { tenantId: tenant.id, email: teacherEmail, name: "Teacher", passwordHash, emailVerifiedAt: new Date() },
    });
    const login = await request(app.getHttpServer()).post("/auth/login").send({ email: teacher.email, password }).expect(200);
    teacherToken = login.body.accessToken;

    const cls = await request(app.getHttpServer()).post("/classes").set(teacherAuth()).send({ name: "Mastery Class" }).expect(201);
    classId = cls.body.id;
    const joinCode: string = cls.body.joinCode;

    // Question 1: single_choice, 2 points, correct = "b".
    const q1 = await request(app.getHttpServer())
      .post("/questions")
      .set(teacherAuth())
      .send({
        type: "single_choice",
        prompt: "Which is a mammal?",
        points: 2,
        options: [{ id: "a", text: "Shark" }, { id: "b", text: "Dolphin" }],
        correctAnswer: "b",
        hint: "It's a marine mammal, not a fish.",
      })
      .expect(201);
    questionIds.push(q1.body.id);

    // Question 2: true_false, 1 point, correct = true.
    const q2 = await request(app.getHttpServer())
      .post("/questions")
      .set(teacherAuth())
      .send({ type: "true_false", prompt: "Dolphins breathe air.", points: 1, correctAnswer: true })
      .expect(201);
    questionIds.push(q2.body.id);

    const conceptA = await request(app.getHttpServer())
      .post("/concepts")
      .set(teacherAuth())
      .send({ name: "Marine Biology", description: "Ocean life basics." })
      .expect(201);
    conceptAId = conceptA.body.id;

    const conceptB = await request(app.getHttpServer())
      .post("/concepts")
      .set(teacherAuth())
      .send({ name: "Animal Classification" })
      .expect(201);
    conceptBId = conceptB.body.id;

    // Question 1 tagged with BOTH concepts; question 2 tagged with
    // conceptB only.
    await request(app.getHttpServer())
      .patch(`/questions/${q1.body.id}/concepts`)
      .set(teacherAuth())
      .send({ conceptIds: [conceptAId, conceptBId] })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/questions/${q2.body.id}/concepts`)
      .set(teacherAuth())
      .send({ conceptIds: [conceptBId] })
      .expect(200);

    const activity = await request(app.getHttpServer()).post("/activities").set(teacherAuth()).send({ title: "Marine quiz" }).expect(201);
    activityId = activity.body.id;
    for (const questionId of questionIds) {
      await request(app.getHttpServer()).post(`/activities/${activityId}/questions`).set(teacherAuth()).send({ questionId }).expect(201);
    }
    await request(app.getHttpServer()).post(`/activities/${activityId}/publish`).set(teacherAuth()).expect(200);

    const assignment = await request(app.getHttpServer())
      .post("/assignments")
      .set(teacherAuth())
      .send({ classId, activityId, dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() })
      .expect(201);
    assignmentId = assignment.body.id;

    const joined = await request(app.getHttpServer())
      .post("/classes/join")
      .send({ joinCode, name: "Learner One", email: learnerEmail, password: "learnerpassword123" })
      .expect(200);
    learnerToken = joined.body.accessToken;

    const rosterEntry = await prisma.rosterEntry.findFirstOrThrow({ where: { classId, email: learnerEmail } });
    learnerId = rosterEntry.userId!;
  });

  afterAll(async () => {
    // Guarded on each id actually being set, per the established
    // cleanup pattern: an unguarded deleteMany with an undefined
    // filter value has no filter at all in Prisma and would wipe
    // every row in the table, not just this test's own data.
    if (assignmentId) {
      await prisma.masteryEvidence.deleteMany({ where: { attemptResponse: { attempt: { assignmentId } } } });
      await prisma.attemptResponse.deleteMany({ where: { attempt: { assignmentId } } });
      await prisma.attempt.deleteMany({ where: { assignmentId } });
      await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    }
    if (activityId) {
      await prisma.activityQuestion.deleteMany({ where: { activityId } });
      await prisma.activity.deleteMany({ where: { id: activityId } });
    }
    if (questionIds.length > 0) {
      await prisma.questionConcept.deleteMany({ where: { questionId: { in: questionIds } } });
      await prisma.questionVersion.deleteMany({ where: { questionId: { in: questionIds } } });
      await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
    }
    if (conceptAId || conceptBId) {
      await prisma.masteryEvidence.deleteMany({ where: { conceptId: { in: [conceptAId, conceptBId].filter(Boolean) } } });
      await prisma.concept.deleteMany({ where: { id: { in: [conceptAId, conceptBId].filter(Boolean) } } });
    }
    if (classId) {
      await prisma.rosterEntry.deleteMany({ where: { classId } });
      await prisma.class.deleteMany({ where: { id: classId } });
    }
    await prisma.user.deleteMany({ where: { email: { in: [teacherEmail, learnerEmail] } } });
    if (tenantId) {
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await app.close();
  });

  it("starts the attempt and reveals the hint on question 1 (hintViewed tracking)", async () => {
    const started = await request(app.getHttpServer()).post(`/assignments/${assignmentId}/attempts/start`).set(learnerAuth()).expect(200);
    attemptId = started.body.id;
    aq1 = started.body.questions[0].activityQuestionId;
    aq2 = started.body.questions[1].activityQuestionId;

    await request(app.getHttpServer())
      .patch(`/attempts/${attemptId}/responses/${aq1}`)
      .set(learnerAuth())
      .send({ hintViewed: true })
      .expect(200);

    const stored = await prisma.attemptResponse.findFirstOrThrow({ where: { attemptId, activityQuestionId: aq1 } });
    expect(stored.hintViewed).toBe(true);
    expect(stored.responseValue).toBeNull(); // hint-only PATCH must not clobber responseValue
  });

  it("hintViewed on one response does not affect the other", async () => {
    const other = await prisma.attemptResponse.findFirstOrThrow({ where: { attemptId, activityQuestionId: aq2 } });
    expect(other.hintViewed).toBe(false);
  });

  it("cannot set hintViewed on an attempt the caller does not own", async () => {
    const outsiderEmail = `mastery-outsider-${Date.now()}@example.com`;
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const outsiderTenant = await prisma.tenant.create({ data: { name: "Outsider Tenant" } });
    const outsider = await prisma.user.create({
      data: { tenantId: outsiderTenant.id, email: outsiderEmail, name: "Outsider", passwordHash, role: "learner", emailVerifiedAt: new Date() },
    });
    const login = await request(app.getHttpServer()).post("/auth/login").send({ email: outsider.email, password }).expect(200);

    await request(app.getHttpServer())
      .patch(`/attempts/${attemptId}/responses/${aq2}`)
      .set({ Authorization: `Bearer ${login.body.accessToken}` })
      .send({ hintViewed: true })
      .expect(404);

    await prisma.user.deleteMany({ where: { email: outsiderEmail } });
    await prisma.tenant.deleteMany({ where: { id: outsiderTenant.id } });
  });

  it("answers and submits, grading both questions correctly", async () => {
    await request(app.getHttpServer()).patch(`/attempts/${attemptId}/responses/${aq1}`).set(learnerAuth()).send({ responseValue: "b" }).expect(200);
    await request(app.getHttpServer()).patch(`/attempts/${attemptId}/responses/${aq2}`).set(learnerAuth()).send({ responseValue: true }).expect(200);

    const res = await request(app.getHttpServer()).post(`/attempts/${attemptId}/submit`).set(learnerAuth()).expect(200);
    expect(res.body.status).toBe("submitted");
    expect(res.body.score).toBeCloseTo(1);
  });

  it("creates a MasteryEvidence row per (gradedResponse, taggedConcept) with correct responseScore/hintViewed", async () => {
    const evidence = await prisma.masteryEvidence.findMany({
      where: { attemptResponse: { attemptId } },
      orderBy: [{ conceptId: "asc" }],
    });
    // Question 1 (hintViewed, full credit) tagged with conceptA + conceptB -> 2 rows.
    // Question 2 (no hint, full credit) tagged with conceptB only -> 1 row.
    expect(evidence).toHaveLength(3);

    const q1Response = await prisma.attemptResponse.findFirstOrThrow({ where: { attemptId, activityQuestionId: aq1 } });
    const q1Evidence = evidence.filter((e) => e.attemptResponseId === q1Response.id);
    expect(q1Evidence).toHaveLength(2);
    for (const row of q1Evidence) {
      // Full credit (2/2) * hint penalty 0.85 = 0.85.
      expect(row.hintViewed).toBe(true);
      expect(row.responseScore).toBeCloseTo(0.85);
    }
    expect(q1Evidence.map((e) => e.conceptId).sort()).toEqual([conceptAId, conceptBId].sort());

    const q2Response = await prisma.attemptResponse.findFirstOrThrow({ where: { attemptId, activityQuestionId: aq2 } });
    const q2Evidence = evidence.filter((e) => e.attemptResponseId === q2Response.id);
    expect(q2Evidence).toHaveLength(1);
    expect(q2Evidence[0].conceptId).toBe(conceptBId);
    expect(q2Evidence[0].hintViewed).toBe(false);
    expect(q2Evidence[0].responseScore).toBeCloseTo(1.0);
  });

  it("GET /mastery/me reflects the recorded evidence with the expected score and state", async () => {
    const res = await request(app.getHttpServer()).get("/mastery/me").set(learnerAuth()).expect(200);
    type MasteryRow = { conceptId: string; score: number; state: string };
    const byId = new Map<string, MasteryRow>(res.body.map((c: MasteryRow) => [c.conceptId, c]));

    // conceptA: single evidence row, score 0.85 (freshly recorded -> recency weight ~1) -> proficient.
    const a = byId.get(conceptAId)!;
    expect(a.score).toBeCloseTo(0.85, 1);
    expect(a.state).toBe("proficient");

    // conceptB: two evidence rows (0.85 and 1.0), both fresh -> weighted average ~0.925 -> mastered.
    const b = byId.get(conceptBId)!;
    expect(b.score).toBeCloseTo(0.925, 1);
    expect(b.state).toBe("mastered");
  });

  it("THE IDEMPOTENCY PROOF: concurrent duplicate submit creates evidence exactly once per concept", async () => {
    const before = await prisma.masteryEvidence.count({ where: { attemptResponse: { attemptId } } });
    expect(before).toBe(3);

    const [r1, r2] = await Promise.all([
      request(app.getHttpServer()).post(`/attempts/${attemptId}/submit`).set(learnerAuth()),
      request(app.getHttpServer()).post(`/attempts/${attemptId}/submit`).set(learnerAuth()),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const after = await prisma.masteryEvidence.count({ where: { attemptResponse: { attemptId } } });
    expect(after).toBe(3);

    // A third, sequential duplicate submit confirms the same holds
    // outside a Promise.all race, not just under it.
    await request(app.getHttpServer()).post(`/attempts/${attemptId}/submit`).set(learnerAuth()).expect(200);
    const afterSequential = await prisma.masteryEvidence.count({ where: { attemptResponse: { attemptId } } });
    expect(afterSequential).toBe(3);
  });

  it("rejects hintViewed on a submitted (locked) attempt", async () => {
    await request(app.getHttpServer())
      .patch(`/attempts/${attemptId}/responses/${aq2}`)
      .set(learnerAuth())
      .send({ hintViewed: true })
      .expect(400);
  });

  it("recency-specific: live mastery score matches a hand-computed expected value against controlled recordedAt timestamps", async () => {
    // A real submission can't time-travel, so this concept's evidence
    // is inserted directly via Prisma with explicit recordedAt values.
    const concept = await prisma.concept.create({
      data: { tenantId, teacherId: (await prisma.class.findUniqueOrThrow({ where: { id: classId } })).teacherId, name: "Recency Test Concept" },
    });
    const response = await prisma.attemptResponse.findFirstOrThrow({ where: { attemptId, activityQuestionId: aq1 } });

    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Reuse aq1's response row for the FK (the unique constraint is on
    // (attemptResponseId, conceptId), so a second concept on the same
    // response is a distinct, valid row) — a second real response
    // isn't needed since only recordedAt/responseScore matter here.
    await prisma.masteryEvidence.create({
      data: {
        tenantId,
        learnerId,
        conceptId: concept.id,
        attemptResponseId: response.id,
        responseScore: 1.0,
        hintViewed: false,
        recordedAt: now,
      },
    });

    const secondResponse = await prisma.attemptResponse.findFirstOrThrow({ where: { attemptId, activityQuestionId: aq2 } });
    await prisma.masteryEvidence.create({
      data: {
        tenantId,
        learnerId,
        conceptId: concept.id,
        attemptResponseId: secondResponse.id,
        responseScore: 0.0,
        hintViewed: false,
        recordedAt: fourteenDaysAgo,
      },
    });

    // Hand-computed: weight(0 days) = 1, weight(14 days) = 0.5.
    // score = (1.0*1 + 0.0*0.5) / (1 + 0.5) = 1.0 / 1.5 = 0.6666...
    const res = await request(app.getHttpServer()).get("/mastery/me").set(learnerAuth()).expect(200);
    const row = res.body.find((c: { conceptId: string }) => c.conceptId === concept.id);
    expect(row.score).toBeCloseTo(2 / 3, 1);
    expect(row.state).toBe("developing");

    await prisma.masteryEvidence.deleteMany({ where: { conceptId: concept.id } });
    await prisma.concept.deleteMany({ where: { id: concept.id } });
  });

  it("GET /classes/:id/mastery reflects the same learner's data for the owning teacher", async () => {
    const res = await request(app.getHttpServer()).get(`/classes/${classId}/mastery`).set(teacherAuth()).expect(200);
    const learnerRow = res.body.learners.find((l: { learnerId: string }) => l.learnerId === learnerId);
    expect(learnerRow).toBeDefined();
    const conceptRow = learnerRow.concepts.find((c: { conceptId: string }) => c.conceptId === conceptBId);
    expect(conceptRow.state).toBe("mastered");
  });

  it("a concept with zero evidence for the learner does not appear in GET /mastery/me", async () => {
    const untouched = await request(app.getHttpServer())
      .post("/concepts")
      .set(teacherAuth())
      .send({ name: "Never Practiced Concept" })
      .expect(201);

    const res = await request(app.getHttpServer()).get("/mastery/me").set(learnerAuth()).expect(200);
    expect(res.body.find((c: { conceptId: string }) => c.conceptId === untouched.body.id)).toBeUndefined();

    await prisma.concept.deleteMany({ where: { id: untouched.body.id } });
  });
});
