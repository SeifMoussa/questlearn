import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "../support/test-app";
import { PrismaService } from "../../src/prisma/prisma.service";
import * as argon2 from "argon2";

/**
 * Confirms a teacher in tenant A cannot view, edit, or archive a
 * question belonging to tenant B — every cross-tenant access must
 * 404, never a distinct 403, matching the posture already established
 * for classes.
 */
describe("questions tenant isolation (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const emailA = `questions-a-${Date.now()}@example.com`;
  const emailB = `questions-b-${Date.now()}@example.com`;
  const password = "correcthorse123";

  let tokenA: string;
  let tokenB: string;
  let questionBId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const tenantA = await prisma.tenant.create({ data: { name: "Questions Tenant A" } });
    const tenantB = await prisma.tenant.create({ data: { name: "Questions Tenant B" } });

    const userA = await prisma.user.create({
      data: { tenantId: tenantA.id, email: emailA, name: "Teacher A", passwordHash, emailVerifiedAt: new Date() },
    });
    const userB = await prisma.user.create({
      data: { tenantId: tenantB.id, email: emailB, name: "Teacher B", passwordHash, emailVerifiedAt: new Date() },
    });

    const loginA = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: userA.email, password })
      .expect(200);
    tokenA = loginA.body.accessToken;

    const loginB = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: userB.email, password })
      .expect(200);
    tokenB = loginB.body.accessToken;

    const created = await request(app.getHttpServer())
      .post("/questions")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ type: "true_false", prompt: "Tenant B's question.", correctAnswer: true })
      .expect(201);
    questionBId = created.body.id;
  });

  afterAll(async () => {
    await prisma.questionVersion.deleteMany({ where: { questionId: questionBId } });
    await prisma.question.deleteMany({ where: { id: questionBId } });
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
    await app.close();
  });

  it("404s a cross-tenant GET on question detail", async () => {
    await request(app.getHttpServer())
      .get(`/questions/${questionBId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(404);
  });

  it("404s a cross-tenant PATCH (edit)", async () => {
    await request(app.getHttpServer())
      .patch(`/questions/${questionBId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ type: "true_false", prompt: "Hijacked prompt.", correctAnswer: false })
      .expect(404);
  });

  it("404s a cross-tenant DELETE (archive)", async () => {
    await request(app.getHttpServer())
      .delete(`/questions/${questionBId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(404);

    const stillActive = await prisma.question.findUnique({ where: { id: questionBId } });
    expect(stillActive?.archivedAt).toBeNull();
  });

  it("excludes the question from tenant A's list entirely", async () => {
    const res = await request(app.getHttpServer())
      .get("/questions")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(res.body.find((q: { id: string }) => q.id === questionBId)).toBeUndefined();
  });

  it("confirms the owning teacher (tenant B) can still access their own question", async () => {
    await request(app.getHttpServer())
      .get(`/questions/${questionBId}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(200);
  });
});
