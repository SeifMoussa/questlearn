import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "../support/test-app";
import { PrismaService } from "../../src/prisma/prisma.service";
import * as argon2 from "argon2";

/**
 * Drives the real HTTP surface of the questions module against real
 * Postgres: full CRUD + the versioning lifecycle the spec calls out
 * explicitly — create -> edit twice -> exactly 3 versions exist, the
 * current version's points reflect the third edit, and the earlier
 * version rows are still queryable (not deleted).
 */
describe("questions lifecycle (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `questions-lifecycle-${Date.now()}@example.com`;
  const password = "correcthorse123";
  let accessToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const tenant = await prisma.tenant.create({ data: { name: "Questions Lifecycle Tenant" } });
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

  it("creates a single_choice question with a v1 QuestionVersion", async () => {
    const res = await request(app.getHttpServer())
      .post("/questions")
      .set(auth())
      .send({
        type: "single_choice",
        prompt: "What is the capital of France?",
        options: [
          { id: "a", text: "Berlin" },
          { id: "b", text: "Paris" },
        ],
        correctAnswer: "b",
      })
      .expect(201);

    expect(res.body.currentVersion.versionNumber).toBe(1);
    expect(res.body.currentVersion.prompt).toBe("What is the capital of France?");
  });

  it("rejects a malformed correctAnswer with a field-scoped validation error", async () => {
    const res = await request(app.getHttpServer())
      .post("/questions")
      .set(auth())
      .send({
        type: "numeric",
        prompt: "What is 10 / 2?",
        correctAnswer: { value: "five" },
      })
      .expect(400);

    expect(res.body.fieldErrors?.correctAnswer).toBeDefined();
  });

  it("full lifecycle: create -> edit twice -> 3 versions exist, current points reflect v3", async () => {
    const created = await request(app.getHttpServer())
      .post("/questions")
      .set(auth())
      .send({
        type: "numeric",
        prompt: "What is the boiling point of water in Celsius?",
        points: 1,
        correctAnswer: { value: 100 },
      })
      .expect(201);
    const questionId = created.body.id;
    const v1Id = created.body.currentVersion.id;

    const edited = await request(app.getHttpServer())
      .patch(`/questions/${questionId}`)
      .set(auth())
      .send({
        type: "numeric",
        prompt: "What is the boiling point of water in Celsius, at sea level?",
        points: 2,
        correctAnswer: { value: 100, tolerance: 1 },
      })
      .expect(200);
    expect(edited.body.currentVersion.versionNumber).toBe(2);
    const v2Id = edited.body.currentVersion.id;

    const editedAgain = await request(app.getHttpServer())
      .patch(`/questions/${questionId}`)
      .set(auth())
      .send({
        type: "numeric",
        prompt: "What is the boiling point of water in Celsius, at sea level?",
        points: 3,
        correctAnswer: { value: 100, tolerance: 2 },
      })
      .expect(200);
    expect(editedAgain.body.currentVersion.versionNumber).toBe(3);
    expect(editedAgain.body.currentVersion.points).toBe(3);

    const allVersions = await prisma.questionVersion.findMany({
      where: { questionId },
      orderBy: { versionNumber: "asc" },
    });
    expect(allVersions).toHaveLength(3);
    expect(allVersions.map((v) => v.id)).toEqual([v1Id, v2Id, editedAgain.body.currentVersion.id]);

    const detail = await request(app.getHttpServer()).get(`/questions/${questionId}`).set(auth()).expect(200);
    expect(detail.body.currentVersion.points).toBe(3);
    expect(detail.body.currentVersion.versionNumber).toBe(3);
  });

  it("excludes archived questions from the default list but keeps them fetchable by id", async () => {
    const created = await request(app.getHttpServer())
      .post("/questions")
      .set(auth())
      .send({ type: "true_false", prompt: "Water boils at 100C at sea level.", correctAnswer: true })
      .expect(201);
    const questionId = created.body.id;

    await request(app.getHttpServer()).delete(`/questions/${questionId}`).set(auth()).expect(200);

    const list = await request(app.getHttpServer()).get("/questions").set(auth()).expect(200);
    expect(list.body.some((q: { id: string }) => q.id === questionId)).toBe(false);

    const detail = await request(app.getHttpServer()).get(`/questions/${questionId}`).set(auth()).expect(200);
    expect(detail.body.archivedAt).not.toBeNull();
  });

  it("404s a nonexistent question id", async () => {
    await request(app.getHttpServer())
      .get("/questions/00000000-0000-0000-0000-000000000000")
      .set(auth())
      .expect(404);
  });
});
