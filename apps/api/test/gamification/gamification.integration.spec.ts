import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "../support/test-app";
import { PrismaService } from "../../src/prisma/prisma.service";
import * as argon2 from "argon2";

/**
 * Drives the real HTTP surface of attempt submission to prove
 * `GamificationService.awardForAttempt` (wired into
 * `AttemptsService.submit()`'s grading transaction) is idempotent
 * under true concurrency, and that award-once badges never duplicate
 * across separate attempts — mirroring the concurrency proof already
 * established in `attempts.integration.spec.ts`.
 */
describe("gamification awards (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const teacherEmail = `gamification-teacher-${Date.now()}@example.com`;
  const password = "correcthorse123";
  let teacherToken: string;
  let classId: string;
  let joinCode: string;
  let questionId: string;

  function teacherAuth() {
    return { Authorization: `Bearer ${teacherToken}` };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const tenant = await prisma.tenant.create({ data: { name: "Gamification Tenant" } });
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
      .send({ name: "Gamification Class" })
      .expect(201);
    classId = cls.body.id;
    joinCode = cls.body.joinCode;

    const q = await request(app.getHttpServer())
      .post("/questions")
      .set(teacherAuth())
      .send({
        type: "single_choice",
        prompt: "2 + 2 = ?",
        points: 2,
        options: [{ id: "x", text: "3" }, { id: "y", text: "4" }],
        correctAnswer: "y",
      })
      .expect(201);
    questionId = q.body.id;
  });

  afterAll(async () => {
    const cls = await prisma.class.findUniqueOrThrow({ where: { id: classId } });
    await prisma.xpTransaction.deleteMany({ where: { tenantId: cls.tenantId } });
    await prisma.learnerBadge.deleteMany({ where: { tenantId: cls.tenantId } });
    await prisma.attemptResponse.deleteMany({ where: { attempt: { assignment: { classId } } } });
    await prisma.attempt.deleteMany({ where: { assignment: { classId } } });
    await prisma.assignment.deleteMany({ where: { classId } });
    await prisma.activityQuestion.deleteMany({ where: { tenantId: cls.tenantId } });
    await prisma.activity.deleteMany({ where: { teacherId: cls.teacherId } });
    await prisma.questionVersion.deleteMany({ where: { questionId } });
    await prisma.question.deleteMany({ where: { id: questionId } });
    await prisma.rosterEntry.deleteMany({ where: { classId } });
    await prisma.class.deleteMany({ where: { id: classId } });
    await prisma.user.deleteMany({ where: { tenantId: cls.tenantId } });
    await app.close();
  });

  async function createPerfectAssignment(title: string) {
    const activity = await request(app.getHttpServer()).post("/activities").set(teacherAuth()).send({ title }).expect(201);
    await request(app.getHttpServer())
      .post(`/activities/${activity.body.id}/questions`)
      .set(teacherAuth())
      .send({ questionId })
      .expect(201);
    await request(app.getHttpServer()).post(`/activities/${activity.body.id}/publish`).set(teacherAuth()).expect(200);

    const assignment = await request(app.getHttpServer())
      .post("/assignments")
      .set(teacherAuth())
      .send({ classId, activityId: activity.body.id, dueAt: new Date(Date.now() + 86400000).toISOString() })
      .expect(201);

    return { activityId: activity.body.id, assignmentId: assignment.body.id };
  }

  it("concurrent submit awards exactly one XpTransaction row and no duplicate badges", async () => {
    const { assignmentId } = await createPerfectAssignment("Concurrency XP quiz");

    const learnerEmail = `gamification-learner-concurrency-${Date.now()}@example.com`;
    const joined = await request(app.getHttpServer())
      .post("/classes/join")
      .send({ joinCode, name: "Concurrency Learner", email: learnerEmail, password: "learnerpassword123" })
      .expect(200);
    const learnerAuth = { Authorization: `Bearer ${joined.body.accessToken}` };
    const learnerId = (await prisma.user.findUniqueOrThrow({ where: { email: learnerEmail } })).id;

    const started = await request(app.getHttpServer())
      .post(`/assignments/${assignmentId}/attempts/start`)
      .set(learnerAuth)
      .expect(200);
    const attemptId = started.body.id;
    const aqId = started.body.questions[0].activityQuestionId;

    await request(app.getHttpServer())
      .patch(`/attempts/${attemptId}/responses/${aqId}`)
      .set(learnerAuth)
      .send({ responseValue: "y" })
      .expect(200);

    const [r1, r2] = await Promise.all([
      request(app.getHttpServer()).post(`/attempts/${attemptId}/submit`).set(learnerAuth),
      request(app.getHttpServer()).post(`/attempts/${attemptId}/submit`).set(learnerAuth),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.body.score).toBeCloseTo(1);

    const xpRows = await prisma.xpTransaction.findMany({ where: { attemptId } });
    expect(xpRows).toHaveLength(1);
    // 20 completion + round(2 points * 10) = 40
    expect(xpRows[0].amount).toBe(40);

    const badgeRows = await prisma.learnerBadge.findMany({ where: { learnerId } });
    const badgeTypes = badgeRows.map((b) => b.badgeType);
    // Exactly one of each qualifying badge type — no duplicates from the race.
    expect(new Set(badgeTypes).size).toBe(badgeTypes.length);
    expect(badgeTypes).toContain("quest_starter");
    expect(badgeTypes).toContain("perfect_score");
  });

  it("a second already-perfect attempt for the same learner does not duplicate the perfect_score badge", async () => {
    const learnerEmail = `gamification-learner-dedupe-${Date.now()}@example.com`;
    const joined = await request(app.getHttpServer())
      .post("/classes/join")
      .send({ joinCode, name: "Dedupe Learner", email: learnerEmail, password: "learnerpassword123" })
      .expect(200);
    const learnerAuth = { Authorization: `Bearer ${joined.body.accessToken}` };
    const learnerId = (await prisma.user.findUniqueOrThrow({ where: { email: learnerEmail } })).id;

    // First perfect attempt.
    const first = await createPerfectAssignment("Dedupe quiz one");
    const started1 = await request(app.getHttpServer())
      .post(`/assignments/${first.assignmentId}/attempts/start`)
      .set(learnerAuth)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/attempts/${started1.body.id}/responses/${started1.body.questions[0].activityQuestionId}`)
      .set(learnerAuth)
      .send({ responseValue: "y" })
      .expect(200);
    await request(app.getHttpServer()).post(`/attempts/${started1.body.id}/submit`).set(learnerAuth).expect(200);

    // Second, separate perfect attempt for the same learner.
    const second = await createPerfectAssignment("Dedupe quiz two");
    const started2 = await request(app.getHttpServer())
      .post(`/assignments/${second.assignmentId}/attempts/start`)
      .set(learnerAuth)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/attempts/${started2.body.id}/responses/${started2.body.questions[0].activityQuestionId}`)
      .set(learnerAuth)
      .send({ responseValue: "y" })
      .expect(200);
    await request(app.getHttpServer()).post(`/attempts/${started2.body.id}/submit`).set(learnerAuth).expect(200);

    const perfectScoreBadges = await prisma.learnerBadge.findMany({
      where: { learnerId, badgeType: "perfect_score" },
    });
    expect(perfectScoreBadges).toHaveLength(1);

    const xpRows = await prisma.xpTransaction.findMany({ where: { learnerId } });
    expect(xpRows).toHaveLength(2);
  });
});
