import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "../support/test-app";
import { PrismaService } from "../../src/prisma/prisma.service";
import * as argon2 from "argon2";

/**
 * Confirms a teacher in tenant A gets 404 — never a distinct 403 — on
 * every assignment endpoint for a tenant B assignment, matching the
 * posture already established for classes, questions, and activities.
 */
describe("assignments tenant isolation (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const emailA = `assignments-a-${Date.now()}@example.com`;
  const emailB = `assignments-b-${Date.now()}@example.com`;
  const password = "correcthorse123";

  let tokenA: string;
  let tokenB: string;
  let classBId: string;
  let activityBId: string;
  let questionBId: string;
  let assignmentBId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const tenantA = await prisma.tenant.create({ data: { name: "Assignments Tenant A" } });
    const tenantB = await prisma.tenant.create({ data: { name: "Assignments Tenant B" } });

    const userA = await prisma.user.create({
      data: { tenantId: tenantA.id, email: emailA, name: "Teacher A", passwordHash, emailVerifiedAt: new Date() },
    });
    const userB = await prisma.user.create({
      data: { tenantId: tenantB.id, email: emailB, name: "Teacher B", passwordHash, emailVerifiedAt: new Date() },
    });

    tokenA = (await request(app.getHttpServer()).post("/auth/login").send({ email: userA.email, password }).expect(200)).body.accessToken;
    tokenB = (await request(app.getHttpServer()).post("/auth/login").send({ email: userB.email, password }).expect(200)).body.accessToken;

    const authB = { Authorization: `Bearer ${tokenB}` };

    const clsB = await request(app.getHttpServer()).post("/classes").set(authB).send({ name: "Tenant B class" }).expect(201);
    classBId = clsB.body.id;

    const qB = await request(app.getHttpServer())
      .post("/questions")
      .set(authB)
      .send({ type: "true_false", prompt: "Tenant B's question.", correctAnswer: true })
      .expect(201);
    questionBId = qB.body.id;

    const activityB = await request(app.getHttpServer()).post("/activities").set(authB).send({ title: "Tenant B activity" }).expect(201);
    activityBId = activityB.body.id;
    await request(app.getHttpServer()).post(`/activities/${activityBId}/questions`).set(authB).send({ questionId: questionBId }).expect(201);
    await request(app.getHttpServer()).post(`/activities/${activityBId}/publish`).set(authB).expect(200);

    const assignmentB = await request(app.getHttpServer())
      .post("/assignments")
      .set(authB)
      .send({ classId: classBId, activityId: activityBId, dueAt: new Date(Date.now() + 86400000).toISOString() })
      .expect(201);
    assignmentBId = assignmentB.body.id;
  });

  afterAll(async () => {
    if (assignmentBId) {
      await prisma.assignment.deleteMany({ where: { id: assignmentBId } });
    }
    if (activityBId) {
      await prisma.activityQuestion.deleteMany({ where: { activityId: activityBId } });
      await prisma.activity.deleteMany({ where: { id: activityBId } });
    }
    if (questionBId) {
      await prisma.questionVersion.deleteMany({ where: { questionId: questionBId } });
      await prisma.question.deleteMany({ where: { id: questionBId } });
    }
    if (classBId) {
      await prisma.rosterEntry.deleteMany({ where: { classId: classBId } });
      await prisma.class.deleteMany({ where: { id: classBId } });
    }
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
    await app.close();
  });

  function authA() {
    return { Authorization: `Bearer ${tokenA}` };
  }

  it("404s a cross-tenant GET on assignment detail", async () => {
    await request(app.getHttpServer()).get(`/assignments/${assignmentBId}`).set(authA()).expect(404);
  });

  it("404s a cross-tenant PATCH", async () => {
    await request(app.getHttpServer())
      .patch(`/assignments/${assignmentBId}`)
      .set(authA())
      .send({ dueAt: new Date(Date.now() + 172800000).toISOString() })
      .expect(404);
  });

  it("404s creating an assignment against another tenant's class", async () => {
    await request(app.getHttpServer())
      .post("/assignments")
      .set(authA())
      .send({ classId: classBId, activityId: activityBId, dueAt: new Date(Date.now() + 86400000).toISOString() })
      .expect(404);
  });

  it("excludes the assignment from tenant A's list entirely", async () => {
    const res = await request(app.getHttpServer()).get("/assignments").set(authA()).expect(200);
    expect(res.body.find((a: { id: string }) => a.id === assignmentBId)).toBeUndefined();
  });

  it("confirms the owning teacher (tenant B) can still access their own assignment", async () => {
    await request(app.getHttpServer()).get(`/assignments/${assignmentBId}`).set({ Authorization: `Bearer ${tokenB}` }).expect(200);
  });
});
