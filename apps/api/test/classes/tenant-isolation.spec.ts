import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "../support/test-app";
import { PrismaService } from "../../src/prisma/prisma.service";
import * as argon2 from "argon2";

/**
 * Confirms a teacher in tenant A cannot view, edit, rotate the join
 * code of, or modify the roster of a class belonging to tenant B —
 * every cross-tenant access must 404, matching the "not found, not a
 * generic 403 leak" posture from the master spec, driven over the
 * real HTTP surface (not a direct Prisma check).
 */
describe("classes tenant isolation (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const emailA = `classes-a-${Date.now()}@example.com`;
  const emailB = `classes-b-${Date.now()}@example.com`;
  const password = "correcthorse123";

  let tokenA: string;
  let tokenB: string;
  let classBId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const tenantA = await prisma.tenant.create({ data: { name: "Tenant A" } });
    const tenantB = await prisma.tenant.create({ data: { name: "Tenant B" } });

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

    const classB = await prisma.class.create({
      data: {
        tenantId: tenantB.id,
        teacherId: userB.id,
        name: "Tenant B's Class",
        joinCode: `TENANTB1`,
        joinCodeExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
      },
    });
    classBId = classB.id;
  });

  afterAll(async () => {
    await prisma.rosterEntry.deleteMany({ where: { classId: classBId } });
    await prisma.class.deleteMany({ where: { id: classBId } });
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
    await app.close();
  });

  it("404s a cross-tenant GET on class detail", async () => {
    await request(app.getHttpServer())
      .get(`/classes/${classBId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(404);
  });

  it("404s a cross-tenant PATCH (rename/archive)", async () => {
    await request(app.getHttpServer())
      .patch(`/classes/${classBId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Hijacked name" })
      .expect(404);
  });

  it("404s a cross-tenant join-code rotation", async () => {
    await request(app.getHttpServer())
      .post(`/classes/${classBId}/join-code/rotate`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(404);
  });

  it("404s a cross-tenant roster add", async () => {
    await request(app.getHttpServer())
      .post(`/classes/${classBId}/roster`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Intruder Entry" })
      .expect(404);
  });

  it("404s a cross-tenant roster delete", async () => {
    const entry = await prisma.rosterEntry.create({
      data: { tenantId: (await prisma.class.findUniqueOrThrow({ where: { id: classBId } })).tenantId, classId: classBId, name: "Real Entry" },
    });

    await request(app.getHttpServer())
      .delete(`/classes/${classBId}/roster/${entry.id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(404);

    const stillActive = await prisma.rosterEntry.findUnique({ where: { id: entry.id } });
    expect(stillActive?.removedAt).toBeNull();
  });

  it("confirms the owning teacher (tenant B) can still access their own class", async () => {
    await request(app.getHttpServer())
      .get(`/classes/${classBId}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(200);
  });

  it("excludes the class from tenant A's list entirely", async () => {
    const res = await request(app.getHttpServer())
      .get("/classes")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    expect(res.body.find((c: { id: string }) => c.id === classBId)).toBeUndefined();
  });
});
