import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "../support/test-app";
import { PrismaService } from "../../src/prisma/prisma.service";
import * as argon2 from "argon2";

/**
 * Confirms a teacher in tenant A cannot view, edit, archive, or tag a
 * question with a concept belonging to tenant B, and cannot read
 * tenant B's class-mastery view — every cross-tenant access 404s,
 * matching the "not found, not a generic 403 leak" posture used
 * throughout the rest of the app.
 */
describe("concepts and mastery tenant isolation (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const emailA = `concepts-a-${Date.now()}@example.com`;
  const emailB = `concepts-b-${Date.now()}@example.com`;
  const password = "correcthorse123";

  let tokenA: string;
  let tokenB: string;
  let conceptBId: string;
  let questionAId: string;
  let classBId: string;
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const tenantA = await prisma.tenant.create({ data: { name: "Concepts Tenant A" } });
    const tenantB = await prisma.tenant.create({ data: { name: "Concepts Tenant B" } });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const userA = await prisma.user.create({
      data: { tenantId: tenantA.id, email: emailA, name: "Teacher A", passwordHash, emailVerifiedAt: new Date() },
    });
    const userB = await prisma.user.create({
      data: { tenantId: tenantB.id, email: emailB, name: "Teacher B", passwordHash, emailVerifiedAt: new Date() },
    });

    const loginA = await request(app.getHttpServer()).post("/auth/login").send({ email: userA.email, password }).expect(200);
    tokenA = loginA.body.accessToken;
    const loginB = await request(app.getHttpServer()).post("/auth/login").send({ email: userB.email, password }).expect(200);
    tokenB = loginB.body.accessToken;

    const conceptB = await prisma.concept.create({
      data: { tenantId: tenantB.id, teacherId: userB.id, name: "Tenant B's Concept" },
    });
    conceptBId = conceptB.id;

    const questionA = await prisma.question.create({ data: { tenantId: tenantA.id, teacherId: userA.id } });
    const versionA = await prisma.questionVersion.create({
      data: {
        questionId: questionA.id,
        tenantId: tenantA.id,
        versionNumber: 1,
        type: "true_false",
        prompt: "Tenant A's question",
        points: 1,
        correctAnswer: true,
      },
    });
    await prisma.question.update({ where: { id: questionA.id }, data: { currentVersionId: versionA.id } });
    questionAId = questionA.id;

    const classB = await prisma.class.create({
      data: {
        tenantId: tenantB.id,
        teacherId: userB.id,
        name: "Tenant B's Class",
        joinCode: "CONCEPTB",
        joinCodeExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
      },
    });
    classBId = classB.id;
  });

  afterAll(async () => {
    // Every deleteMany below is guarded on the id it depends on
    // actually being set, matching the established pattern: an
    // unguarded call with an undefined filter value matches every row
    // in the table, not just this test's own data.
    if (questionAId) {
      await prisma.questionConcept.deleteMany({ where: { questionId: questionAId } });
      await prisma.questionVersion.deleteMany({ where: { questionId: questionAId } });
      await prisma.question.deleteMany({ where: { id: questionAId } });
    }
    if (conceptBId) {
      await prisma.concept.deleteMany({ where: { id: conceptBId } });
    }
    if (classBId) {
      await prisma.rosterEntry.deleteMany({ where: { classId: classBId } });
      await prisma.class.deleteMany({ where: { id: classBId } });
    }
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
    if (tenantAId || tenantBId) {
      await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId].filter(Boolean) } } });
    }
    await app.close();
  });

  it("404s a cross-tenant GET on a concept", async () => {
    await request(app.getHttpServer()).get(`/concepts/${conceptBId}`).set("Authorization", `Bearer ${tokenA}`).expect(404);
  });

  it("404s a cross-tenant PATCH on a concept", async () => {
    await request(app.getHttpServer())
      .patch(`/concepts/${conceptBId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Hijacked name" })
      .expect(404);
  });

  it("404s a cross-tenant archive (DELETE) on a concept", async () => {
    await request(app.getHttpServer()).delete(`/concepts/${conceptBId}`).set("Authorization", `Bearer ${tokenA}`).expect(404);
  });

  it("excludes tenant B's concept from tenant A's list entirely", async () => {
    const res = await request(app.getHttpServer()).get("/concepts").set("Authorization", `Bearer ${tokenA}`).expect(200);
    expect(res.body.find((c: { id: string }) => c.id === conceptBId)).toBeUndefined();
  });

  it("rejects tagging a question with a concept from another tenant (404, no partial application)", async () => {
    await request(app.getHttpServer())
      .patch(`/questions/${questionAId}/concepts`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ conceptIds: [conceptBId] })
      .expect(404);

    const tags = await prisma.questionConcept.findMany({ where: { questionId: questionAId } });
    expect(tags).toHaveLength(0);
  });

  it("404s a cross-tenant GET on class mastery", async () => {
    await request(app.getHttpServer()).get(`/classes/${classBId}/mastery`).set("Authorization", `Bearer ${tokenA}`).expect(404);
  });

  it("confirms the owning teacher (tenant B) can still access their own concept and class mastery", async () => {
    await request(app.getHttpServer()).get(`/concepts/${conceptBId}`).set("Authorization", `Bearer ${tokenB}`).expect(200);
    await request(app.getHttpServer()).get(`/classes/${classBId}/mastery`).set("Authorization", `Bearer ${tokenB}`).expect(200);
  });
});
