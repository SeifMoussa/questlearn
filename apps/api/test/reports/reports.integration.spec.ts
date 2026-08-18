import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "../support/test-app";
import { PrismaService } from "../../src/prisma/prisma.service";
import * as argon2 from "argon2";

/**
 * Drives the real HTTP surface with a controlled fixture (not the
 * shared demo seed, so every number here is independently
 * hand-checkable): a 2-question activity, a 4-entry roster (2 real
 * learners who submit, 1 who never does, 1 teacher-added placeholder
 * with no account), proving the dashboard/CSV/question-analysis/
 * learner-report endpoints all compute the same real numbers a human
 * reading the raw Attempt/AttemptResponse rows would.
 */
describe("reports (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const teacherEmail = `reports-teacher-${Date.now()}@example.com`;
  const password = "correcthorse123";
  let teacherToken: string;
  let tenantId: string;
  let classId: string;
  let joinCode: string;
  let activityId: string;
  let assignmentId: string;
  let conceptId: string;

  const questionIds: string[] = [];
  let aq1: string; // single_choice, 2pts, tagged with conceptId
  let aq2: string; // true_false, 1pt

  let learnerAId: string;
  let scoreA: number;
  let scoreB: number;

  function teacherAuth() {
    return { Authorization: `Bearer ${teacherToken}` };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const tenant = await prisma.tenant.create({ data: { name: "Reports Tenant" } });
    tenantId = tenant.id;
    const teacher = await prisma.user.create({
      data: { tenantId: tenant.id, email: teacherEmail, name: "Teacher", passwordHash, emailVerifiedAt: new Date() },
    });
    const login = await request(app.getHttpServer()).post("/auth/login").send({ email: teacher.email, password }).expect(200);
    teacherToken = login.body.accessToken;

    const cls = await request(app.getHttpServer()).post("/classes").set(teacherAuth()).send({ name: "Reports Class" }).expect(201);
    classId = cls.body.id;
    joinCode = cls.body.joinCode;

    const concept = await request(app.getHttpServer()).post("/concepts").set(teacherAuth()).send({ name: "Reports Concept" }).expect(201);
    conceptId = concept.body.id;

    const q1 = await request(app.getHttpServer())
      .post("/questions")
      .set(teacherAuth())
      .send({
        type: "single_choice",
        prompt: "Reports Q1",
        points: 2,
        options: [{ id: "x", text: "wrong" }, { id: "y", text: "right" }],
        correctAnswer: "y",
        hint: "It's the second one.",
      })
      .expect(201);
    questionIds.push(q1.body.id);
    await request(app.getHttpServer()).patch(`/questions/${q1.body.id}/concepts`).set(teacherAuth()).send({ conceptIds: [conceptId] }).expect(200);

    const q2 = await request(app.getHttpServer())
      .post("/questions")
      .set(teacherAuth())
      .send({ type: "true_false", prompt: "Reports Q2", points: 1, correctAnswer: true })
      .expect(201);
    questionIds.push(q2.body.id);

    const activity = await request(app.getHttpServer()).post("/activities").set(teacherAuth()).send({ title: "Reports Activity" }).expect(201);
    activityId = activity.body.id;
    await request(app.getHttpServer()).post(`/activities/${activityId}/questions`).set(teacherAuth()).send({ questionId: q1.body.id }).expect(201);
    await request(app.getHttpServer()).post(`/activities/${activityId}/questions`).set(teacherAuth()).send({ questionId: q2.body.id }).expect(201);
    await request(app.getHttpServer()).post(`/activities/${activityId}/publish`).set(teacherAuth()).expect(200);

    const assignment = await request(app.getHttpServer())
      .post("/assignments")
      .set(teacherAuth())
      .send({ classId, activityId, dueAt: new Date(Date.now() + 86400000).toISOString() })
      .expect(201);
    assignmentId = assignment.body.id;

    // A placeholder roster entry (teacher-added, no account) -- counts
    // toward assignedCount but can never submit.
    await request(app.getHttpServer())
      .post(`/classes/${classId}/roster`)
      .set(teacherAuth())
      .send({ name: "Never Registers", email: null })
      .expect(201);

    // Learner A: both correct, and views the hint on Q1.
    const joinedA = await request(app.getHttpServer())
      .post("/classes/join")
      .send({ joinCode, name: "Learner A", email: `reports-a-${Date.now()}@example.com`, password: "learnerpassword123" })
      .expect(200);
    const authA = { Authorization: `Bearer ${joinedA.body.accessToken}` };
    learnerAId = joinedA.body.user.id;

    const startedA = await request(app.getHttpServer()).post(`/assignments/${assignmentId}/attempts/start`).set(authA).expect(200);
    aq1 = startedA.body.questions[0].activityQuestionId;
    aq2 = startedA.body.questions[1].activityQuestionId;
    await request(app.getHttpServer()).patch(`/attempts/${startedA.body.id}/responses/${aq1}`).set(authA).send({ hintViewed: true }).expect(200);
    await request(app.getHttpServer()).patch(`/attempts/${startedA.body.id}/responses/${aq1}`).set(authA).send({ responseValue: "y" }).expect(200);
    await request(app.getHttpServer()).patch(`/attempts/${startedA.body.id}/responses/${aq2}`).set(authA).send({ responseValue: true }).expect(200);
    const submittedA = await request(app.getHttpServer()).post(`/attempts/${startedA.body.id}/submit`).set(authA).expect(200);
    scoreA = submittedA.body.score;

    // Learner B: Q1 wrong, Q2 correct.
    const joinedB = await request(app.getHttpServer())
      .post("/classes/join")
      .send({ joinCode, name: "Learner B", email: `reports-b-${Date.now()}@example.com`, password: "learnerpassword123" })
      .expect(200);
    const authB = { Authorization: `Bearer ${joinedB.body.accessToken}` };

    const startedB = await request(app.getHttpServer()).post(`/assignments/${assignmentId}/attempts/start`).set(authB).expect(200);
    await request(app.getHttpServer()).patch(`/attempts/${startedB.body.id}/responses/${aq1}`).set(authB).send({ responseValue: "x" }).expect(200);
    await request(app.getHttpServer()).patch(`/attempts/${startedB.body.id}/responses/${aq2}`).set(authB).send({ responseValue: true }).expect(200);
    const submittedB = await request(app.getHttpServer()).post(`/attempts/${startedB.body.id}/submit`).set(authB).expect(200);
    scoreB = submittedB.body.score;

    // Learner C joins but never starts the assignment -- counts toward
    // assignedCount, never toward submittedCount.
    await request(app.getHttpServer())
      .post("/classes/join")
      .send({ joinCode, name: "Learner C", email: `reports-c-${Date.now()}@example.com`, password: "learnerpassword123" })
      .expect(200);
  });

  afterAll(async () => {
    if (assignmentId) {
      await prisma.masteryEvidence.deleteMany({ where: { attemptResponse: { attempt: { assignmentId } } } });
      await prisma.xpTransaction.deleteMany({ where: { attempt: { assignmentId } } });
      await prisma.learnerBadge.deleteMany({ where: { tenantId } });
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

  it("GET /classes/:id/report: completion rate and average score match the hand-checkable fixture", async () => {
    const res = await request(app.getHttpServer()).get(`/classes/${classId}/report`).set(teacherAuth()).expect(200);

    expect(res.body.className).toBe("Reports Class");
    expect(res.body.assignments).toHaveLength(1);

    const row = res.body.assignments[0];
    expect(row.title).toBe("Reports Activity");
    // 4 roster entries: A, B, C, and the placeholder.
    expect(row.assignedCount).toBe(4);
    expect(row.submittedCount).toBe(2);
    expect(row.completionRate).toBeCloseTo(0.5);
    expect(row.averageScore).toBeCloseTo((scoreA + scoreB) / 2);

    expect(res.body.summary.overallCompletionRate).toBeCloseTo(0.5);
    expect(res.body.summary.overallAverageScore).toBeCloseTo((scoreA + scoreB) / 2);

    const conceptRow = res.body.masterySummary.find((c: { conceptId: string }) => c.conceptId === conceptId);
    expect(conceptRow).toBeDefined();
    // 2 learners have evidence for this concept (A and B both answered
    // the tagged question); exactly one state bucket sums to 2.
    const total = conceptRow.beginning + conceptRow.developing + conceptRow.proficient + conceptRow.mastered;
    expect(total).toBe(2);

    expect(res.body.learners).toHaveLength(4);
    const placeholderRow = res.body.learners.find((l: { name: string }) => l.name === "Never Registers");
    expect(placeholderRow.learnerId).toBeNull();
  });

  it("an assignment with zero submissions reports null rates, not zero", async () => {
    const emptyActivity = await request(app.getHttpServer()).post("/activities").set(teacherAuth()).send({ title: "Untouched Activity" }).expect(201);
    await request(app.getHttpServer()).post(`/activities/${emptyActivity.body.id}/questions`).set(teacherAuth()).send({ questionId: questionIds[0] }).expect(201);
    await request(app.getHttpServer()).post(`/activities/${emptyActivity.body.id}/publish`).set(teacherAuth()).expect(200);
    const emptyAssignment = await request(app.getHttpServer())
      .post("/assignments")
      .set(teacherAuth())
      .send({ classId, activityId: emptyActivity.body.id, dueAt: new Date(Date.now() + 86400000).toISOString() })
      .expect(201);

    const res = await request(app.getHttpServer()).get(`/classes/${classId}/report`).set(teacherAuth()).expect(200);
    const row = res.body.assignments.find((a: { assignmentId: string }) => a.assignmentId === emptyAssignment.body.id);
    expect(row.submittedCount).toBe(0);
    expect(row.averageScore).toBeNull();

    await prisma.assignment.deleteMany({ where: { id: emptyAssignment.body.id } });
    await prisma.activityQuestion.deleteMany({ where: { activityId: emptyActivity.body.id } });
    await prisma.activity.deleteMany({ where: { id: emptyActivity.body.id } });
  });

  it("GET /classes/:id/report/csv: correct headers, content type, and one row per assignment", async () => {
    const res = await request(app.getHttpServer()).get(`/classes/${classId}/report/csv`).set(teacherAuth()).expect(200);

    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("attachment");

    const lines: string[] = res.text.trim().split("\r\n");
    expect(lines[0]).toBe("Assignment,Due Date,Assigned,Submitted,Completion Rate,Average Score");
    const dataRow = lines.find((l) => l.startsWith("Reports Activity"));
    expect(dataRow).toBeDefined();
    expect(dataRow).toContain("4,2,50.0%");
  });

  it("GET /activities/:id/report: per-question correctness, points, and hint-view rate", async () => {
    const res = await request(app.getHttpServer()).get(`/activities/${activityId}/report`).set(teacherAuth()).expect(200);

    expect(res.body.title).toBe("Reports Activity");
    expect(res.body.questions).toHaveLength(2);

    const q1Row = res.body.questions.find((q: { activityQuestionId: string }) => q.activityQuestionId === aq1);
    // A correct, B wrong -> 1 of 2.
    expect(q1Row.submittedResponseCount).toBe(2);
    expect(q1Row.correctCount).toBe(1);
    expect(q1Row.correctRate).toBeCloseTo(0.5);
    // Only A viewed the hint.
    expect(q1Row.hintViewedCount).toBe(1);
    expect(q1Row.hintViewRate).toBeCloseTo(0.5);

    const q2Row = res.body.questions.find((q: { activityQuestionId: string }) => q.activityQuestionId === aq2);
    // Both correct.
    expect(q2Row.correctCount).toBe(2);
    expect(q2Row.correctRate).toBeCloseTo(1.0);
    expect(q2Row.hintViewRate).toBeCloseTo(0);
  });

  it("GET /classes/:classId/learners/:learnerId/report: composes attempts, mastery, gamification, and quests", async () => {
    const res = await request(app.getHttpServer()).get(`/classes/${classId}/learners/${learnerAId}/report`).set(teacherAuth()).expect(200);

    expect(res.body.learner.name).toBe("Learner A");
    expect(res.body.attempts).toHaveLength(1);
    expect(res.body.attempts[0].activityTitle).toBe("Reports Activity");
    expect(res.body.attempts[0].score).toBeCloseTo(scoreA);

    // Learner A answered the concept-tagged question, so mastery has a row for it.
    const conceptRow = res.body.mastery.find((m: { conceptId: string }) => m.conceptId === conceptId);
    expect(conceptRow).toBeDefined();

    // A real submitted attempt always awards at least the flat completion XP.
    expect(res.body.gamification.totalXp).toBeGreaterThan(0);

    expect(Array.isArray(res.body.quests)).toBe(true);
  });

  it("learner report 404s for a learner who isn't on this class's roster", async () => {
    const outsiderEmail = `reports-outsider-${Date.now()}@example.com`;
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const outsiderTenant = await prisma.tenant.create({ data: { name: "Reports Outsider Tenant" } });
    const outsider = await prisma.user.create({
      data: { tenantId: outsiderTenant.id, email: outsiderEmail, name: "Outsider", passwordHash, role: "learner", emailVerifiedAt: new Date() },
    });

    await request(app.getHttpServer()).get(`/classes/${classId}/learners/${outsider.id}/report`).set(teacherAuth()).expect(404);

    await prisma.user.deleteMany({ where: { email: outsiderEmail } });
    await prisma.tenant.deleteMany({ where: { id: outsiderTenant.id } });
  });

  it("a cross-tenant teacher gets 404, not 403, on all four report endpoints", async () => {
    const outsiderEmail = `reports-cross-tenant-${Date.now()}@example.com`;
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const outsiderTenant = await prisma.tenant.create({ data: { name: "Reports Cross-Tenant" } });
    const outsider = await prisma.user.create({
      data: { tenantId: outsiderTenant.id, email: outsiderEmail, name: "Outsider Teacher", passwordHash, emailVerifiedAt: new Date() },
    });
    const login = await request(app.getHttpServer()).post("/auth/login").send({ email: outsider.email, password }).expect(200);
    const outsiderAuth = { Authorization: `Bearer ${login.body.accessToken}` };

    await request(app.getHttpServer()).get(`/classes/${classId}/report`).set(outsiderAuth).expect(404);
    await request(app.getHttpServer()).get(`/classes/${classId}/report/csv`).set(outsiderAuth).expect(404);
    await request(app.getHttpServer()).get(`/activities/${activityId}/report`).set(outsiderAuth).expect(404);
    await request(app.getHttpServer()).get(`/classes/${classId}/learners/${learnerAId}/report`).set(outsiderAuth).expect(404);

    await prisma.user.deleteMany({ where: { email: outsiderEmail } });
    await prisma.tenant.deleteMany({ where: { id: outsiderTenant.id } });
  });
});
