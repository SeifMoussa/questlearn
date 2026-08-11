import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "../support/test-app";
import { PrismaService } from "../../src/prisma/prisma.service";
import * as argon2 from "argon2";

/**
 * Drives the real HTTP surface of the activities module against real
 * Postgres: full lifecycle (create -> add 3 questions -> reorder ->
 * publish -> confirm pinned versions), and — the single most important
 * test in this module — proves publishing actually freezes content
 * against a real subsequent question edit, not just that the pinning
 * code compiles.
 */
describe("activities lifecycle (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `activities-lifecycle-${Date.now()}@example.com`;
  const password = "correcthorse123";
  let accessToken: string;
  const questionIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const tenant = await prisma.tenant.create({ data: { name: "Activities Lifecycle Tenant" } });
    const user = await prisma.user.create({
      data: { tenantId: tenant.id, email, name: "Teacher", passwordHash, emailVerifiedAt: new Date() },
    });

    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: user.email, password })
      .expect(200);
    accessToken = login.body.accessToken;

    for (let i = 0; i < 3; i++) {
      const created = await request(app.getHttpServer())
        .post("/questions")
        .set(auth())
        .send({ type: "true_false", prompt: `Lifecycle question ${i + 1}`, correctAnswer: true })
        .expect(201);
      questionIds.push(created.body.id);
    }
  });

  afterAll(async () => {
    await prisma.activityQuestion.deleteMany({ where: { tenantId: (await prisma.user.findUnique({ where: { email } }))?.tenantId } });
    await prisma.activity.deleteMany({ where: { teacherId: (await prisma.user.findUnique({ where: { email } }))?.id } });
    await prisma.questionVersion.deleteMany({ where: { questionId: { in: questionIds } } });
    await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  function auth() {
    return { Authorization: `Bearer ${accessToken}` };
  }

  let activityId: string;
  const activityQuestionIds: string[] = [];

  it("creates a draft activity", async () => {
    const res = await request(app.getHttpServer())
      .post("/activities")
      .set(auth())
      .send({ title: "Weekly quiz" })
      .expect(201);

    expect(res.body.status).toBe("draft");
    activityId = res.body.id;
  });

  it("adds 3 questions, appended in order", async () => {
    for (const questionId of questionIds) {
      const res = await request(app.getHttpServer())
        .post(`/activities/${activityId}/questions`)
        .set(auth())
        .send({ questionId })
        .expect(201);
      expect(res.body.questions.some((q: { questionId: string }) => q.questionId === questionId)).toBe(true);
    }

    const detail = await request(app.getHttpServer()).get(`/activities/${activityId}`).set(auth()).expect(200);
    expect(detail.body.questions).toHaveLength(3);
    expect(detail.body.questions.map((q: { questionId: string }) => q.questionId)).toEqual(questionIds);
    activityQuestionIds.push(...detail.body.questions.map((q: { activityQuestionId: string }) => q.activityQuestionId));
  });

  it("reorders the questions", async () => {
    const reversed = [...activityQuestionIds].reverse();
    const res = await request(app.getHttpServer())
      .patch(`/activities/${activityId}/questions/reorder`)
      .set(auth())
      .send({ activityQuestionIds: reversed })
      .expect(200);

    expect(res.body.questions.map((q: { activityQuestionId: string }) => q.activityQuestionId)).toEqual(reversed);
  });

  it("rejects reorder with a mismatched id set", async () => {
    await request(app.getHttpServer())
      .patch(`/activities/${activityId}/questions/reorder`)
      .set(auth())
      .send({ activityQuestionIds: [activityQuestionIds[0]] })
      .expect(400);
  });

  it("publishes the activity, pinning each ActivityQuestion to the question's version at that moment", async () => {
    const beforePublish = await request(app.getHttpServer()).get(`/activities/${activityId}`).set(auth()).expect(200);
    const expectedPrompts = new Map(beforePublish.body.questions.map((q: { questionId: string; prompt: string }) => [q.questionId, q.prompt]));

    const res = await request(app.getHttpServer()).post(`/activities/${activityId}/publish`).set(auth()).expect(200);
    expect(res.body.status).toBe("published");
    expect(res.body.publishedAt).not.toBeNull();

    const rows = await prisma.activityQuestion.findMany({ where: { activityId } });
    for (const row of rows) {
      const question = await prisma.question.findUniqueOrThrow({ where: { id: row.questionId } });
      expect(row.pinnedVersionId).toBe(question.currentVersionId);
    }

    for (const q of res.body.questions) {
      expect(q.prompt).toBe(expectedPrompts.get(q.questionId));
      expect(q.pinned).toBe(true);
    }
  });

  it("rejects re-publishing", async () => {
    await request(app.getHttpServer()).post(`/activities/${activityId}/publish`).set(auth()).expect(400);
  });

  it("rejects structural changes on a published activity", async () => {
    await request(app.getHttpServer())
      .patch(`/activities/${activityId}`)
      .set(auth())
      .send({ title: "Renamed" })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/activities/${activityId}/questions`)
      .set(auth())
      .send({ questionId: questionIds[0] })
      .expect(400);

    await request(app.getHttpServer())
      .delete(`/activities/${activityId}/questions/${activityQuestionIds[0]}`)
      .set(auth())
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/activities/${activityId}/questions/reorder`)
      .set(auth())
      .send({ activityQuestionIds: activityQuestionIds })
      .expect(400);
  });

  it("THE IMMUTABILITY PROOF: editing an underlying question after publish does not change the published activity's resolved content", async () => {
    const editedQuestionId = questionIds[0];

    const beforeEdit = await request(app.getHttpServer()).get(`/activities/${activityId}`).set(auth()).expect(200);
    const beforeEntry = beforeEdit.body.questions.find((q: { questionId: string }) => q.questionId === editedQuestionId);
    expect(beforeEntry).toBeDefined();
    const preEditPrompt = beforeEntry.prompt;
    const preEditAnswer = beforeEntry.correctAnswer;

    // Edit the underlying question — Module 3's always-version behavior
    // creates a brand-new QuestionVersion and repoints currentVersionId.
    const edited = await request(app.getHttpServer())
      .patch(`/questions/${editedQuestionId}`)
      .set(auth())
      .send({ type: "true_false", prompt: "THIS PROMPT WAS EDITED AFTER PUBLISH", correctAnswer: false })
      .expect(200);
    expect(edited.body.currentVersion.prompt).toBe("THIS PROMPT WAS EDITED AFTER PUBLISH");
    expect(edited.body.currentVersion.versionNumber).toBe(2);

    // Re-fetch the published activity: it must still show the
    // pre-edit content, proving pinnedVersionId — not the question's
    // live currentVersionId — drives resolution once published.
    const afterEdit = await request(app.getHttpServer()).get(`/activities/${activityId}`).set(auth()).expect(200);
    const afterEntry = afterEdit.body.questions.find((q: { questionId: string }) => q.questionId === editedQuestionId);
    expect(afterEntry.prompt).toBe(preEditPrompt);
    expect(afterEntry.prompt).not.toBe("THIS PROMPT WAS EDITED AFTER PUBLISH");
    expect(afterEntry.correctAnswer).toEqual(preEditAnswer);
    expect(afterEntry.pinned).toBe(true);
  });

  it("archives the published activity (allowed regardless of status)", async () => {
    const res = await request(app.getHttpServer()).delete(`/activities/${activityId}`).set(auth()).expect(200);
    expect(res.body.status).toBe("published");
    const stillDetailed = await prisma.activity.findUnique({ where: { id: activityId } });
    expect(stillDetailed?.archivedAt).not.toBeNull();
    expect(stillDetailed?.status).toBe("published");
  });

  it("404s a nonexistent activity id", async () => {
    await request(app.getHttpServer())
      .get("/activities/00000000-0000-0000-0000-000000000000")
      .set(auth())
      .expect(404);
  });

  it("draft activities resolve content live off the question's current version, not pinned", async () => {
    const draft = await request(app.getHttpServer()).post("/activities").set(auth()).send({ title: "Live draft" }).expect(201);
    const liveActivityId = draft.body.id;

    await request(app.getHttpServer())
      .post(`/activities/${liveActivityId}/questions`)
      .set(auth())
      .send({ questionId: questionIds[1] })
      .expect(201);

    const before = await request(app.getHttpServer()).get(`/activities/${liveActivityId}`).set(auth()).expect(200);
    expect(before.body.questions[0].pinned).toBe(false);
    const beforePrompt = before.body.questions[0].prompt;

    await request(app.getHttpServer())
      .patch(`/questions/${questionIds[1]}`)
      .set(auth())
      .send({ type: "true_false", prompt: "LIVE EDIT SHOULD SHOW IMMEDIATELY", correctAnswer: true })
      .expect(200);

    const after = await request(app.getHttpServer()).get(`/activities/${liveActivityId}`).set(auth()).expect(200);
    expect(after.body.questions[0].prompt).toBe("LIVE EDIT SHOULD SHOW IMMEDIATELY");
    expect(after.body.questions[0].prompt).not.toBe(beforePrompt);

    await prisma.activityQuestion.deleteMany({ where: { activityId: liveActivityId } });
    await prisma.activity.deleteMany({ where: { id: liveActivityId } });
  });

  it("rejects publishing an activity with zero questions", async () => {
    const empty = await request(app.getHttpServer()).post("/activities").set(auth()).send({ title: "Empty" }).expect(201);
    await request(app.getHttpServer()).post(`/activities/${empty.body.id}/publish`).set(auth()).expect(400);
    await prisma.activity.deleteMany({ where: { id: empty.body.id } });
  });
});
