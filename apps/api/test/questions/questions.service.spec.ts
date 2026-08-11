import { NotFoundException } from "@nestjs/common";
import { QuestionsService } from "../../src/questions/questions.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import { SecurityLogger } from "../../src/auth/security-logger.service";

describe("QuestionsService", () => {
  let service: QuestionsService;
  let prisma: {
    $transaction: jest.Mock;
    question: {
      create: jest.Mock;
      update: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    questionVersion: {
      create: jest.Mock;
    };
  };
  const ctx = { userId: "teacher-1", tenantId: "tenant-1" };

  const singleChoicePayload = {
    type: "single_choice" as const,
    prompt: "What is 2 + 2?",
    options: [
      { id: "a", text: "3" },
      { id: "b", text: "4" },
    ],
    correctAnswer: "b",
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
      question: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      questionVersion: {
        create: jest.fn(),
      },
    };
    service = new QuestionsService(prisma as unknown as PrismaService, new SecurityLogger());
  });

  describe("create", () => {
    it("creates the Question and a v1 QuestionVersion atomically, then sets currentVersionId", async () => {
      prisma.question.create.mockResolvedValueOnce({ id: "q-1" });
      prisma.questionVersion.create.mockResolvedValueOnce({ id: "v-1", versionNumber: 1 });
      prisma.question.update.mockResolvedValueOnce({ id: "q-1", currentVersionId: "v-1", currentVersion: { versionNumber: 1 } });

      const result = await service.create(ctx, singleChoicePayload);

      expect(prisma.questionVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ questionId: "q-1", versionNumber: 1, tenantId: "tenant-1" }),
        }),
      );
      expect(prisma.question.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "q-1" }, data: { currentVersionId: "v-1" } }),
      );
      expect(result.currentVersionId).toBe("v-1");
    });
  });

  describe("update / versioning", () => {
    it("bumps the version number and updates currentVersionId, leaving the prior version row untouched", async () => {
      const existing = {
        id: "q-1",
        tenantId: "tenant-1",
        teacherId: "teacher-1",
        currentVersion: { id: "v-1", versionNumber: 1 },
      };
      prisma.question.findFirst.mockResolvedValueOnce(existing);
      prisma.questionVersion.create.mockResolvedValueOnce({ id: "v-2", versionNumber: 2 });
      prisma.question.update.mockResolvedValueOnce({ id: "q-1", currentVersionId: "v-2", currentVersion: { versionNumber: 2 } });

      const result = await service.update(ctx, "q-1", { ...singleChoicePayload, prompt: "What is 3 + 3?" });

      expect(prisma.questionVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ versionNumber: 2 }) }),
      );
      // The prior version's row is never touched by an update/delete call.
      expect(prisma.question.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { currentVersionId: "v-2" } }),
      );
      expect(result.currentVersion?.versionNumber).toBe(2);
    });

    it("increments from whatever the current version number is, not always from 1", async () => {
      const existing = {
        id: "q-1",
        tenantId: "tenant-1",
        teacherId: "teacher-1",
        currentVersion: { id: "v-4", versionNumber: 4 },
      };
      prisma.question.findFirst.mockResolvedValueOnce(existing);
      prisma.questionVersion.create.mockResolvedValueOnce({ id: "v-5", versionNumber: 5 });
      prisma.question.update.mockResolvedValueOnce({ id: "q-1", currentVersionId: "v-5" });

      await service.update(ctx, "q-1", singleChoicePayload);

      expect(prisma.questionVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ versionNumber: 5 }) }),
      );
    });

    it("404s editing a question outside the caller's tenant/ownership", async () => {
      prisma.question.findFirst.mockResolvedValueOnce(null);

      await expect(service.update(ctx, "q-x", singleChoicePayload)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.questionVersion.create).not.toHaveBeenCalled();
    });
  });

  describe("findOne / ownership scoping", () => {
    it("404s when the question isn't found under the caller's tenant and teacher", async () => {
      prisma.question.findFirst.mockResolvedValueOnce(null);

      await expect(service.findOne(ctx, "q-x")).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.question.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "q-x", tenantId: "tenant-1", teacherId: "teacher-1" } }),
      );
    });
  });

  describe("archive", () => {
    it("sets archivedAt rather than deleting the row", async () => {
      const existing = { id: "q-1", tenantId: "tenant-1", teacherId: "teacher-1", currentVersion: { versionNumber: 1 } };
      prisma.question.findFirst.mockResolvedValueOnce(existing);
      prisma.question.update.mockResolvedValueOnce({ id: "q-1", archivedAt: new Date() });

      const result = await service.archive(ctx, "q-1");

      expect(prisma.question.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "q-1" }, data: { archivedAt: expect.any(Date) } }),
      );
      expect(result.archivedAt).not.toBeNull();
    });

    it("404s archiving a question outside the caller's tenant/ownership", async () => {
      prisma.question.findFirst.mockResolvedValueOnce(null);

      await expect(service.archive(ctx, "q-x")).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
