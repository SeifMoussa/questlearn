import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ActivitiesService } from "../../src/activities/activities.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import { SecurityLogger } from "../../src/auth/security-logger.service";

describe("ActivitiesService", () => {
  let service: ActivitiesService;
  let prisma: {
    $transaction: jest.Mock;
    activity: {
      create: jest.Mock;
      update: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    activityQuestion: {
      create: jest.Mock;
      delete: jest.Mock;
      update: jest.Mock;
    };
    question: {
      findFirst: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
  };
  const ctx = { userId: "teacher-1", tenantId: "tenant-1" };

  function draftActivity(questions: Array<{ id: string; order: number; questionId: string; pinnedVersionId: string | null }>) {
    return {
      id: "activity-1",
      tenantId: "tenant-1",
      teacherId: "teacher-1",
      title: "Weekly quiz",
      status: "draft",
      publishedAt: null,
      createdAt: new Date(),
      archivedAt: null,
      questions: questions.map((q) => ({
        ...q,
        tenantId: "tenant-1",
        activityId: "activity-1",
        createdAt: new Date(),
        question: {
          id: q.questionId,
          currentVersion: { id: `${q.questionId}-v-current`, type: "true_false", prompt: "p", points: 1, hint: null, explanation: null, options: null, correctAnswer: true },
        },
        pinnedVersion: q.pinnedVersionId
          ? { id: q.pinnedVersionId, type: "true_false", prompt: "pinned-p", points: 1, hint: null, explanation: null, options: null, correctAnswer: true }
          : null,
      })),
    };
  }

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(async (arg: unknown) => {
        if (typeof arg === "function") {
          return (arg as (tx: unknown) => unknown)(prisma);
        }
        // array-of-promises form used by reorder()
        return Promise.all(arg as Promise<unknown>[]);
      }),
      activity: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      activityQuestion: {
        create: jest.fn(),
        delete: jest.fn(),
        update: jest.fn(),
      },
      question: {
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
    };
    service = new ActivitiesService(prisma as unknown as PrismaService, new SecurityLogger());
  });

  describe("publish", () => {
    it("rejects publishing an activity with zero questions", async () => {
      prisma.activity.findFirst.mockResolvedValueOnce(draftActivity([]));

      await expect(service.publish(ctx, "activity-1")).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("rejects re-publishing an already-published activity", async () => {
      const activity = draftActivity([{ id: "aq-1", order: 0, questionId: "q-1", pinnedVersionId: "v-1" }]);
      activity.status = "published";
      prisma.activity.findFirst.mockResolvedValueOnce(activity);

      await expect(service.publish(ctx, "activity-1")).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("pins every ActivityQuestion to its question's CURRENT currentVersionId inside one transaction", async () => {
      const activity = draftActivity([
        { id: "aq-1", order: 0, questionId: "q-1", pinnedVersionId: null },
        { id: "aq-2", order: 1, questionId: "q-2", pinnedVersionId: null },
      ]);
      prisma.activity.findFirst
        .mockResolvedValueOnce(activity) // findOwnedOrThrow inside publish
        .mockResolvedValueOnce(draftActivity([])); // findOwnedOrThrow inside the final findOne() call

      prisma.question.findUniqueOrThrow
        .mockResolvedValueOnce({ id: "q-1", currentVersionId: "q-1-live-version" })
        .mockResolvedValueOnce({ id: "q-2", currentVersionId: "q-2-live-version" });

      await service.publish(ctx, "activity-1");

      expect(prisma.activityQuestion.update).toHaveBeenCalledWith({
        where: { id: "aq-1" },
        data: { pinnedVersionId: "q-1-live-version" },
      });
      expect(prisma.activityQuestion.update).toHaveBeenCalledWith({
        where: { id: "aq-2" },
        data: { pinnedVersionId: "q-2-live-version" },
      });
      expect(prisma.activity.update).toHaveBeenCalledWith({
        where: { id: "activity-1" },
        data: { status: "published", publishedAt: expect.any(Date) },
      });
    });
  });

  describe("reorder", () => {
    it("rejects an array that doesn't exactly match the current question-id set (missing an id)", async () => {
      const activity = draftActivity([
        { id: "aq-1", order: 0, questionId: "q-1", pinnedVersionId: null },
        { id: "aq-2", order: 1, questionId: "q-2", pinnedVersionId: null },
      ]);
      prisma.activity.findFirst.mockResolvedValueOnce(activity);

      await expect(
        service.reorder(ctx, "activity-1", { activityQuestionIds: ["aq-1"] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("rejects an array containing an id outside the activity's current questions", async () => {
      const activity = draftActivity([{ id: "aq-1", order: 0, questionId: "q-1", pinnedVersionId: null }]);
      prisma.activity.findFirst.mockResolvedValueOnce(activity);

      await expect(
        service.reorder(ctx, "activity-1", { activityQuestionIds: ["aq-1", "aq-not-in-activity"] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("re-assigns order to match the given sequence when the set matches exactly", async () => {
      const activity = draftActivity([
        { id: "aq-1", order: 0, questionId: "q-1", pinnedVersionId: null },
        { id: "aq-2", order: 1, questionId: "q-2", pinnedVersionId: null },
      ]);
      prisma.activity.findFirst.mockResolvedValueOnce(activity).mockResolvedValueOnce(draftActivity([]));

      await service.reorder(ctx, "activity-1", { activityQuestionIds: ["aq-2", "aq-1"] });

      expect(prisma.activityQuestion.update).toHaveBeenCalledWith({ where: { id: "aq-2" }, data: { order: 0 } });
      expect(prisma.activityQuestion.update).toHaveBeenCalledWith({ where: { id: "aq-1" }, data: { order: 1 } });
    });
  });

  describe("draft-only guards", () => {
    function publishedActivity() {
      const activity = draftActivity([{ id: "aq-1", order: 0, questionId: "q-1", pinnedVersionId: "v-1" }]);
      activity.status = "published";
      return activity;
    }

    it("rejects renaming a published activity", async () => {
      prisma.activity.findFirst.mockResolvedValueOnce(publishedActivity());
      await expect(service.update(ctx, "activity-1", { title: "New title" })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.activity.update).not.toHaveBeenCalled();
    });

    it("rejects adding a question to a published activity", async () => {
      prisma.activity.findFirst.mockResolvedValueOnce(publishedActivity());
      await expect(
        service.addQuestion(ctx, "activity-1", { questionId: "q-2" }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.activityQuestion.create).not.toHaveBeenCalled();
    });

    it("rejects removing a question from a published activity", async () => {
      prisma.activity.findFirst.mockResolvedValueOnce(publishedActivity());
      await expect(service.removeQuestion(ctx, "activity-1", "aq-1")).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.activityQuestion.delete).not.toHaveBeenCalled();
    });

    it("rejects reordering a published activity", async () => {
      prisma.activity.findFirst.mockResolvedValueOnce(publishedActivity());
      await expect(
        service.reorder(ctx, "activity-1", { activityQuestionIds: ["aq-1"] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("archive", () => {
    it("archives a draft activity", async () => {
      prisma.activity.findFirst
        .mockResolvedValueOnce(draftActivity([]))
        .mockResolvedValueOnce(draftActivity([]));
      prisma.activity.update.mockResolvedValueOnce({ id: "activity-1", archivedAt: new Date() });

      await service.archive(ctx, "activity-1");
      expect(prisma.activity.update).toHaveBeenCalledWith({
        where: { id: "activity-1" },
        data: { archivedAt: expect.any(Date) },
      });
    });

    it("archives a published activity too (visibility-only, allowed in any status)", async () => {
      const activity = draftActivity([{ id: "aq-1", order: 0, questionId: "q-1", pinnedVersionId: "v-1" }]);
      activity.status = "published";
      prisma.activity.findFirst.mockResolvedValueOnce(activity).mockResolvedValueOnce(activity);
      prisma.activity.update.mockResolvedValueOnce({ id: "activity-1", archivedAt: new Date() });

      await service.archive(ctx, "activity-1");
      expect(prisma.activity.update).toHaveBeenCalledWith({
        where: { id: "activity-1" },
        data: { archivedAt: expect.any(Date) },
      });
    });
  });

  describe("ownership scoping", () => {
    it("404s findOne for an activity outside the caller's tenant/ownership", async () => {
      prisma.activity.findFirst.mockResolvedValueOnce(null);
      await expect(service.findOne(ctx, "activity-x")).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
