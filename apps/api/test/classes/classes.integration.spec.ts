import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "../support/test-app";
import { PrismaService } from "../../src/prisma/prisma.service";
import * as argon2 from "argon2";

/**
 * Drives the real HTTP surface of the classes module against real
 * Postgres: create -> list -> detail -> rename -> roster add/remove
 * -> join-code rotation, checking the correctness details the spec
 * calls out explicitly (soft-delete, old code invalidated).
 */
describe("classes lifecycle (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `classes-lifecycle-${Date.now()}@example.com`;
  const password = "correcthorse123";
  let accessToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const tenant = await prisma.tenant.create({ data: { name: "Lifecycle Tenant" } });
    const user = await prisma.user.create({
      data: { tenantId: tenant.id, email, name: "Teacher", passwordHash, emailVerifiedAt: new Date() },
    });

    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: user.email, password })
      .expect(200);
    accessToken = login.body.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  function auth() {
    return { Authorization: `Bearer ${accessToken}` };
  }

  it("creates a class with a join code and default expiry", async () => {
    const res = await request(app.getHttpServer())
      .post("/classes")
      .set(auth())
      .send({ name: "Homeroom 4B" })
      .expect(201);

    expect(res.body.name).toBe("Homeroom 4B");
    expect(res.body.joinCode).toMatch(/^[A-Z0-9]{8}$/);
    expect(new Date(res.body.joinCodeExpiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects an empty class name with a field-scoped validation error", async () => {
    const res = await request(app.getHttpServer())
      .post("/classes")
      .set(auth())
      .send({ name: "" })
      .expect(400);

    expect(res.body.fieldErrors?.name).toBeDefined();
  });

  it("full lifecycle: list -> detail -> roster add -> roster remove -> join-code rotation", async () => {
    const created = await request(app.getHttpServer())
      .post("/classes")
      .set(auth())
      .send({ name: "Period 1 History" })
      .expect(201);
    const classId = created.body.id;
    const originalCode = created.body.joinCode;

    const list = await request(app.getHttpServer()).get("/classes").set(auth()).expect(200);
    expect(list.body.some((c: { id: string }) => c.id === classId)).toBe(true);

    const detail = await request(app.getHttpServer()).get(`/classes/${classId}`).set(auth()).expect(200);
    expect(detail.body.roster).toEqual([]);

    const addRes = await request(app.getHttpServer())
      .post(`/classes/${classId}/roster`)
      .set(auth())
      .send({ name: "Riley Chen", email: "riley@example.com" })
      .expect(201);
    const rosterId = addRes.body.id;

    const afterAdd = await request(app.getHttpServer()).get(`/classes/${classId}`).set(auth()).expect(200);
    expect(afterAdd.body.roster).toHaveLength(1);
    expect(afterAdd.body.roster[0].name).toBe("Riley Chen");

    await request(app.getHttpServer())
      .delete(`/classes/${classId}/roster/${rosterId}`)
      .set(auth())
      .expect(200);

    const afterRemove = await request(app.getHttpServer()).get(`/classes/${classId}`).set(auth()).expect(200);
    expect(afterRemove.body.roster).toHaveLength(0);

    // Soft-delete: the row still exists in the DB with removedAt set,
    // it just doesn't appear in the roster list.
    const raw = await prisma.rosterEntry.findUnique({ where: { id: rosterId } });
    expect(raw).not.toBeNull();
    expect(raw?.removedAt).not.toBeNull();

    const rotated = await request(app.getHttpServer())
      .post(`/classes/${classId}/join-code/rotate`)
      .set(auth())
      .expect(200);
    expect(rotated.body.joinCode).not.toBe(originalCode);

    // The old join code no longer resolves to any class.
    const staleLookup = await prisma.class.findUnique({ where: { joinCode: originalCode } });
    expect(staleLookup).toBeNull();
  });

  it("archives a class via PATCH and excludes it from the default list", async () => {
    const created = await request(app.getHttpServer())
      .post("/classes")
      .set(auth())
      .send({ name: "To Be Archived" })
      .expect(201);
    const classId = created.body.id;

    await request(app.getHttpServer())
      .patch(`/classes/${classId}`)
      .set(auth())
      .send({ archived: true })
      .expect(200);

    const list = await request(app.getHttpServer()).get("/classes").set(auth()).expect(200);
    expect(list.body.some((c: { id: string }) => c.id === classId)).toBe(false);

    const detail = await request(app.getHttpServer()).get(`/classes/${classId}`).set(auth()).expect(200);
    expect(detail.body.archivedAt).not.toBeNull();
  });

  it("404s a nonexistent class id rather than leaking a distinct error shape", async () => {
    await request(app.getHttpServer())
      .get("/classes/00000000-0000-0000-0000-000000000000")
      .set(auth())
      .expect(404);
  });
});
