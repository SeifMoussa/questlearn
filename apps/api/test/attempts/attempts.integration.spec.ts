import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "../support/test-app";
import { PrismaService } from "../../src/prisma/prisma.service";
import * as argon2 from "argon2";

/**
 * Drives the real HTTP surface of join-code redemption, assignments,
 * and attempts against real Postgres: redeem a join code (creating a
 * real User + RosterEntry + session) -> start an attempt -> autosave
 * -> submit -> assert a hand-computed score against the activity's
 * actual pinned content. Also covers the idempotency proof, the
 * frozen-content proof, answer-key leakage, and roster-membership
 * authorization.
 */
describe("assignments and attempts lifecycle (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const teacherEmail = `attempts-teacher-${Date.now()}@example.com`;
  const password = "correcthorse123";
  let teacherToken: string;

  const questionIds: string[] = [];
  let classId: string;
  let activityId: string;
  let assignmentId: string;
  let activityQuestionIds: string[] = [];

  const learnerEmail = `attempts-learner-${Date.now()}@example.com`;
  let learnerToken: string;
  let attemptId: string;

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
    const tenant = await prisma.tenant.create({ data: { name: "Attempts Lifecycle Tenant" } });
    const teacher = await prisma.user.create({
      data: { tenantId: tenant.id, email: teacherEmail, name: "Teacher", passwordHash, emailVerifiedAt: new Date() },
    });
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: teacher.email, password })
      .expect(200);
    teacherToken = login.body.accessToken;

    const cls = await request(app.getHttpServer())
      .post("/classes")
      .set(teacherAuth())
      .send({ name: "Attempts Class" })
      .expect(201);
    classId = cls.body.id;
    const joinCode: string = cls.body.joinCode;

    // Question A: multiple_choice, 4 points, correct = {a, b}.
    const qA = await request(app.getHttpServer())
      .post("/questions")
      .set(teacherAuth())
      .send({
        type: "multiple_choice",
        prompt: "Which are primary colors?",
        points: 4,
        options: [{ id: "a", text: "Red" }, { id: "b", text: "Blue" }, { id: "c", text: "Green" }, { id: "d", text: "Purple" }],
        correctAnswer: ["a", "b"],
      })
      .expect(201);
    questionIds.push(qA.body.id);

    // Question B: true_false, 1 point, correct = true.
    const qB = await request(app.getHttpServer())
      .post("/questions")
      .set(teacherAuth())
      .send({ type: "true_false", prompt: "The sky is blue.", points: 1, correctAnswer: true })
      .expect(201);
    questionIds.push(qB.body.id);

    const activity = await request(app.getHttpServer())
      .post("/activities")
      .set(teacherAuth())
      .send({ title: "Colors quiz" })
      .expect(201);
    activityId = activity.body.id;

    for (const questionId of questionIds) {
      await request(app.getHttpServer())
        .post(`/activities/${activityId}/questions`)
        .set(teacherAuth())
        .send({ questionId })
        .expect(201);
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
    expect(joined.body.class.id).toBe(classId);

    const rosterEntry = await prisma.rosterEntry.findFirst({ where: { classId, email: learnerEmail } });
    expect(rosterEntry).not.toBeNull();
    expect(rosterEntry?.userId).not.toBeNull();
  });

  afterAll(async () => {
    // See the classes/activities tenant-isolation specs for why every
    // deleteMany below is guarded on the id it depends on actually
    // being set — an unguarded call with an undefined filter value
    // matches (and deletes) every row in the table, not just this
    // test's own data.
    if (assignmentId) {
      await prisma.attemptResponse.deleteMany({ where: { attempt: { assignmentId } } });
      await prisma.attempt.deleteMany({ where: { assignmentId } });
      await prisma.assignment.deleteMany({ where: { id: assignmentId } });
    }
    if (activityId) {
      await prisma.activityQuestion.deleteMany({ where: { activityId } });
      await prisma.activity.deleteMany({ where: { id: activityId } });
    }
    await prisma.questionVersion.deleteMany({ where: { questionId: { in: questionIds } } });
    await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
    if (classId) {
      await prisma.rosterEntry.deleteMany({ where: { classId } });
      await prisma.class.deleteMany({ where: { id: classId } });
    }
    await prisma.user.deleteMany({ where: { email: { in: [teacherEmail, learnerEmail] } } });
    await app.close();
  });

  it("starts an attempt, creating one empty AttemptResponse per question", async () => {
    const res = await request(app.getHttpServer())
      .post(`/assignments/${assignmentId}/attempts/start`)
      .set(learnerAuth())
      .expect(200);

    attemptId = res.body.id;
    expect(res.body.status).toBe("in_progress");
    expect(res.body.questions).toHaveLength(2);
    activityQuestionIds = res.body.questions.map((q: { activityQuestionId: string }) => q.activityQuestionId);
  });

  it("is idempotent: starting again returns the same attempt, not a duplicate", async () => {
    const res = await request(app.getHttpServer())
      .post(`/assignments/${assignmentId}/attempts/start`)
      .set(learnerAuth())
      .expect(200);
    expect(res.body.id).toBe(attemptId);

    const rows = await prisma.attempt.findMany({ where: { assignmentId, learnerId: (await prisma.user.findUniqueOrThrow({ where: { email: learnerEmail } })).id } });
    expect(rows).toHaveLength(1);
  });

  it("strips correctAnswer/isCorrect/pointsAwarded before submit (answer-key leakage test)", async () => {
    const res = await request(app.getHttpServer()).get(`/attempts/${attemptId}`).set(learnerAuth()).expect(200);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("correctAnswer");
    expect(raw).not.toContain("isCorrect");
    expect(raw).not.toContain("pointsAwarded");
  });

  it("autosaves a response per question", async () => {
    const [aqA, aqB] = activityQuestionIds;
    await request(app.getHttpServer())
      .patch(`/attempts/${attemptId}/responses/${aqA}`)
      .set(learnerAuth())
      .send({ responseValue: ["a"] })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/attempts/${attemptId}/responses/${aqB}`)
      .set(learnerAuth())
      .send({ responseValue: true })
      .expect(200);

    const rows = await prisma.attemptResponse.findMany({ where: { attemptId }, orderBy: { createdAt: "asc" } });
    expect(rows.find((r) => r.activityQuestionId === aqA)?.responseValue).toEqual(["a"]);
    expect(rows.find((r) => r.activityQuestionId === aqB)?.responseValue).toEqual(true);
  });

  it("submits and grades against a hand-computed expected score", async () => {
    const res = await request(app.getHttpServer()).post(`/attempts/${attemptId}/submit`).set(learnerAuth()).expect(200);

    expect(res.body.status).toBe("submitted");
    // A: multiple_choice, correct={a,b}, response=[a] -> 1/2 - 0/2 = 0.5 -> 0.5*4 = 2 pts
    // B: true_false, correct=true, response=true -> 1 -> 1*1 = 1 pt
    // overall: (2 + 1) / (4 + 1) = 0.6
    expect(res.body.score).toBeCloseTo(0.6);

    const [aqA, aqB] = activityQuestionIds;
    const qA = res.body.questions.find((q: { activityQuestionId: string }) => q.activityQuestionId === aqA);
    const qB = res.body.questions.find((q: { activityQuestionId: string }) => q.activityQuestionId === aqB);
    expect(qA.pointsAwarded).toBeCloseTo(2);
    expect(qA.isCorrect).toBe(false);
    expect(qA.correctAnswer).toEqual(["a", "b"]);
    expect(qB.pointsAwarded).toBeCloseTo(1);
    expect(qB.isCorrect).toBe(true);
    expect(qB.correctAnswer).toBe(true);
  });

  it("includes correctAnswer/isCorrect/pointsAwarded after submit", async () => {
    const res = await request(app.getHttpServer()).get(`/attempts/${attemptId}`).set(learnerAuth()).expect(200);
    const raw = JSON.stringify(res.body);
    expect(raw).toContain("correctAnswer");
    expect(raw).toContain("isCorrect");
    expect(raw).toContain("pointsAwarded");
  });

  it("THE IDEMPOTENCY PROOF: duplicate submit (sequential) does not double-grade or change submittedAt", async () => {
    const before = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    const beforeResponses = await prisma.attemptResponse.findMany({ where: { attemptId }, orderBy: { activityQuestionId: "asc" } });

    const res = await request(app.getHttpServer()).post(`/attempts/${attemptId}/submit`).set(learnerAuth()).expect(200);

    const after = await prisma.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    const afterResponses = await prisma.attemptResponse.findMany({ where: { attemptId }, orderBy: { activityQuestionId: "asc" } });

    expect(res.body.score).toBeCloseTo(0.6);
    expect(after.submittedAt?.getTime()).toBe(before.submittedAt?.getTime());
    expect(after.score).toBe(before.score);
    expect(afterResponses.map((r) => r.pointsAwarded)).toEqual(beforeResponses.map((r) => r.pointsAwarded));
  });

  it("THE IDEMPOTENCY PROOF: concurrent submit (Promise.all) grades exactly once", async () => {
    // A fresh attempt+assignment pair, isolated from the one already
    // submitted above, so this test proves true concurrency rather
    // than re-exercising the already-submitted path.
    const cls = await request(app.getHttpServer()).post("/classes").set(teacherAuth()).send({ name: "Concurrency Class" }).expect(201);
    const concurrencyClassId = cls.body.id;
    const joinCode: string = cls.body.joinCode;

    const q = await request(app.getHttpServer())
      .post("/questions")
      .set(teacherAuth())
      .send({ type: "single_choice", prompt: "2 + 2 = ?", points: 2, options: [{ id: "x", text: "3" }, { id: "y", text: "4" }], correctAnswer: "y" })
      .expect(201);

    const activity = await request(app.getHttpServer()).post("/activities").set(teacherAuth()).send({ title: "Concurrency quiz" }).expect(201);
    await request(app.getHttpServer()).post(`/activities/${activity.body.id}/questions`).set(teacherAuth()).send({ questionId: q.body.id }).expect(201);
    await request(app.getHttpServer()).post(`/activities/${activity.body.id}/publish`).set(teacherAuth()).expect(200);

    const assignment = await request(app.getHttpServer())
      .post("/assignments")
      .set(teacherAuth())
      .send({ classId: concurrencyClassId, activityId: activity.body.id, dueAt: new Date(Date.now() + 86400000).toISOString() })
      .expect(201);

    const concurrencyLearnerEmail = `attempts-concurrency-learner-${Date.now()}@example.com`;
    const joined = await request(app.getHttpServer())
      .post("/classes/join")
      .send({ joinCode, name: "Concurrency Learner", email: concurrencyLearnerEmail, password: "learnerpassword123" })
      .expect(200);
    const concurrencyLearnerToken = joined.body.accessToken;
    const concurrencyAuth = { Authorization: `Bearer ${concurrencyLearnerToken}` };

    const started = await request(app.getHttpServer())
      .post(`/assignments/${assignment.body.id}/attempts/start`)
      .set(concurrencyAuth)
      .expect(200);
    const concurrencyAttemptId = started.body.id;
    const aqId = started.body.questions[0].activityQuestionId;

    await request(app.getHttpServer())
      .patch(`/attempts/${concurrencyAttemptId}/responses/${aqId}`)
      .set(concurrencyAuth)
      .send({ responseValue: "y" })
      .expect(200);

    const [r1, r2] = await Promise.all([
      request(app.getHttpServer()).post(`/attempts/${concurrencyAttemptId}/submit`).set(concurrencyAuth),
      request(app.getHttpServer()).post(`/attempts/${concurrencyAttemptId}/submit`).set(concurrencyAuth),
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.body.score).toBeCloseTo(1);
    expect(r2.body.score).toBeCloseTo(1);
    expect(r1.body.submittedAt).toBe(r2.body.submittedAt);

    const responses = await prisma.attemptResponse.findMany({ where: { attemptId: concurrencyAttemptId } });
    expect(responses).toHaveLength(1);
    expect(responses[0].pointsAwarded).toBeCloseTo(2);

    // cleanup this sub-scenario's own rows immediately (guarded on ids
    // that are always set at this point in the test, since every
    // creation call above already `.expect(201)`/`.expect(200)`ed).
    await prisma.attemptResponse.deleteMany({ where: { attemptId: concurrencyAttemptId } });
    await prisma.attempt.deleteMany({ where: { id: concurrencyAttemptId } });
    await prisma.assignment.deleteMany({ where: { id: assignment.body.id } });
    await prisma.activityQuestion.deleteMany({ where: { activityId: activity.body.id } });
    await prisma.activity.deleteMany({ where: { id: activity.body.id } });
    await prisma.questionVersion.deleteMany({ where: { questionId: q.body.id } });
    await prisma.question.deleteMany({ where: { id: q.body.id } });
    await prisma.rosterEntry.deleteMany({ where: { classId: concurrencyClassId } });
    await prisma.class.deleteMany({ where: { id: concurrencyClassId } });
    await prisma.user.deleteMany({ where: { email: concurrencyLearnerEmail } });
  });

  it("frozen-content proof: editing the underlying question after submit does not change the graded result", async () => {
    const beforeResult = await request(app.getHttpServer()).get(`/attempts/${attemptId}`).set(learnerAuth()).expect(200);
    const beforeScore = beforeResult.body.score;
    const beforeQuestionA = beforeResult.body.questions.find((q: { questionId: string }) => q.questionId === questionIds[0]);

    await request(app.getHttpServer())
      .patch(`/questions/${questionIds[0]}`)
      .set(teacherAuth())
      .send({
        type: "multiple_choice",
        prompt: "THIS PROMPT WAS EDITED AFTER SUBMIT",
        points: 4,
        options: [{ id: "a", text: "Red" }, { id: "b", text: "Blue" }, { id: "c", text: "Green" }, { id: "d", text: "Purple" }],
        correctAnswer: ["a", "b", "c"],
      })
      .expect(200);

    const afterResult = await request(app.getHttpServer()).get(`/attempts/${attemptId}`).set(learnerAuth()).expect(200);
    const afterQuestionA = afterResult.body.questions.find((q: { questionId: string }) => q.questionId === questionIds[0]);

    expect(afterResult.body.score).toBe(beforeScore);
    expect(afterQuestionA.prompt).toBe(beforeQuestionA.prompt);
    expect(afterQuestionA.prompt).not.toBe("THIS PROMPT WAS EDITED AFTER SUBMIT");
    expect(afterQuestionA.correctAnswer).toEqual(beforeQuestionA.correctAnswer);
    expect(afterQuestionA.pointsAwarded).toBe(beforeQuestionA.pointsAwarded);
  });

  it("rejects autosave on a submitted (locked) attempt", async () => {
    const [aqA] = activityQuestionIds;
    await request(app.getHttpServer())
      .patch(`/attempts/${attemptId}/responses/${aqA}`)
      .set(learnerAuth())
      .send({ responseValue: ["a", "b"] })
      .expect(400);
  });

  it("404s a nonexistent attempt id", async () => {
    await request(app.getHttpServer())
      .get("/attempts/00000000-0000-0000-0000-000000000000")
      .set(learnerAuth())
      .expect(404);
  });

  it("a learner not enrolled in the assignment's class cannot start an attempt for it (404, not 403)", async () => {
    const outsiderEmail = `attempts-outsider-${Date.now()}@example.com`;
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const tenant = await prisma.tenant.create({ data: { name: "Outsider Tenant" } });
    const outsider = await prisma.user.create({
      data: { tenantId: tenant.id, email: outsiderEmail, name: "Outsider", passwordHash, role: "learner", emailVerifiedAt: new Date() },
    });
    const login = await request(app.getHttpServer()).post("/auth/login").send({ email: outsider.email, password }).expect(200);

    await request(app.getHttpServer())
      .post(`/assignments/${assignmentId}/attempts/start`)
      .set({ Authorization: `Bearer ${login.body.accessToken}` })
      .expect(404);

    await prisma.user.deleteMany({ where: { email: outsiderEmail } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  });

  it("redeeming the same join code again while already enrolled is a no-op, not a duplicate roster entry", async () => {
    const cls = await request(app.getHttpServer()).get(`/classes/${classId}`).set(teacherAuth()).expect(200);
    const joinCode: string = cls.body.joinCode;

    const res = await request(app.getHttpServer())
      .post("/classes/join")
      .set(learnerAuth())
      .send({ joinCode })
      .expect(200);
    expect(res.body.class.id).toBe(classId);

    const entries = await prisma.rosterEntry.findMany({ where: { classId, email: learnerEmail } });
    expect(entries).toHaveLength(1);
  });

  it("rejects an invalid join code with a generic not-found error", async () => {
    await request(app.getHttpServer())
      .post("/classes/join")
      .send({ joinCode: "NOTREAL1", name: "Nobody", email: `nobody-${Date.now()}@example.com`, password: "somepassword123" })
      .expect(404);
  });

  it("rejects creating an assignment from a non-published (draft) activity", async () => {
    const draft = await request(app.getHttpServer()).post("/activities").set(teacherAuth()).send({ title: "Still a draft" }).expect(201);
    await request(app.getHttpServer())
      .post("/assignments")
      .set(teacherAuth())
      .send({ classId, activityId: draft.body.id, dueAt: new Date(Date.now() + 86400000).toISOString() })
      .expect(400);
    await prisma.activity.deleteMany({ where: { id: draft.body.id } });
  });

  it("patches an assignment's dueAt", async () => {
    const newDueAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const res = await request(app.getHttpServer())
      .patch(`/assignments/${assignmentId}`)
      .set(teacherAuth())
      .send({ dueAt: newDueAt })
      .expect(200);
    expect(new Date(res.body.dueAt).toISOString()).toBe(newDueAt);
  });
});
