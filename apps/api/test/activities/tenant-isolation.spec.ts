import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "../support/test-app";
import { PrismaService } from "../../src/prisma/prisma.service";
import * as argon2 from "argon2";

/**
 * Confirms a teacher in tenant A gets 404 — never a distinct 403 — on
 * every activity endpoint for a tenant B activity, matching the
 * posture already established for classes and questions.
 */
describe("activities tenant isolation (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const emailA = `activities-a-${Date.now()}@example.com`;
  const emailB = `activities-b-${Date.now()}@example.com`;
  const password = "correcthorse123";

  let tokenA: string;
  let tokenB: string;
  let activityBId: string;
  let activityQuestionBId: string;
  let questionBId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const tenantA = await prisma.tenant.create({ data: { name: "Activities Tenant A" } });
    const tenantB = await prisma.tenant.create({ data: { name: "Activities Tenant B" } });

    const userA = await prisma.user.create({
      data: { tenantId: tenantA.id, email: emailA, name: "Teacher A", passwordHash, emailVerifiedAt: new Date() },
    });
    const userB = await prisma.user.create({
      data: { tenantId: tenantB.id, email: emailB, name: "Teacher B", passwordHash, emailVerifiedAt: new Date() },
    });

    tokenA = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: userA.email, password }).expect(200)
    ).body.accessToken;
    tokenB = (
      await request(app.getHttpServer()).post("/auth/login").send({ email: userB.email, password }).expect(200)
    ).body.accessToken;

    const questionB = await request(app.getHttpServer())
      .post("/questions")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ type: "true_false", prompt: "Tenant B's question.", correctAnswer: true })
      .expect(201);
    questionBId = questionB.body.id;

    const activityB = await request(app.getHttpServer())
      .post("/activities")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ title: "Tenant B's activity" })
      .expect(201);
    activityBId = activityB.body.id;

    const addQuestion = await request(app.getHttpServer())
      .post(`/activities/${activityBId}/questions`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ questionId: questionBId })
      .expect(201);
    activityQuestionBId = addQuestion.body.questions[0].activityQuestionId;
  });

  afterAll(async () => {
    await prisma.activityQuestion.deleteMany({ where: { activityId: activityBId } });
    await prisma.activity.deleteMany({ where: { id: activityBId } });
    await prisma.questionVersion.deleteMany({ where: { questionId: questionBId } });
    await prisma.question.deleteMany({ where: { id: questionBId } });
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
    await app.close();
  });

  function authA() {
    return { Authorization: `Bearer ${tokenA}` };
  }

  it("404s a cross-tenant GET on activity detail", async () => {
    await request(app.getHttpServer()).get(`/activities/${activityBId}`).set(authA()).expect(404);
  });

  it("404s a cross-tenant PATCH (rename)", async () => {
    await request(app.getHttpServer())
      .patch(`/activities/${activityBId}`)
      .set(authA())
      .send({ title: "Hijacked" })
      .expect(404);
  });

  it("404s a cross-tenant POST to add a question", async () => {
    await request(app.getHttpServer())
      .post(`/activities/${activityBId}/questions`)
      .set(authA())
      .send({ questionId: questionBId })
      .expect(404);
  });

  it("404s a cross-tenant DELETE of a question", async () => {
    await request(app.getHttpServer())
      .delete(`/activities/${activityBId}/questions/${activityQuestionBId}`)
      .set(authA())
      .expect(404);
  });

  it("404s a cross-tenant reorder", async () => {
    await request(app.getHttpServer())
      .patch(`/activities/${activityBId}/questions/reorder`)
      .set(authA())
      .send({ activityQuestionIds: [activityQuestionBId] })
      .expect(404);
  });

  it("404s a cross-tenant publish", async () => {
    await request(app.getHttpServer()).post(`/activities/${activityBId}/publish`).set(authA()).expect(404);
  });

  it("404s a cross-tenant archive", async () => {
    await request(app.getHttpServer()).delete(`/activities/${activityBId}`).set(authA()).expect(404);

    const stillActive = await prisma.activity.findUnique({ where: { id: activityBId } });
    expect(stillActive?.archivedAt).toBeNull();
  });

  it("excludes the activity from tenant A's list entirely", async () => {
    const res = await request(app.getHttpServer()).get("/activities").set(authA()).expect(200);
    expect(res.body.find((a: { id: string }) => a.id === activityBId)).toBeUndefined();
  });

  it("confirms the owning teacher (tenant B) can still access their own activity", async () => {
    await request(app.getHttpServer())
      .get(`/activities/${activityBId}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(200);
  });
});
