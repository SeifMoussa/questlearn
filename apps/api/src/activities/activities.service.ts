import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityLogger } from "../auth/security-logger.service";
import { CreateActivityDto, UpdateActivityDto, AddActivityQuestionDto, ReorderActivityQuestionsDto } from "./dto/activity.dto";

export interface TeacherContext {
  userId: string;
  tenantId: string;
}

const activityQuestionInclude = {
  question: { include: { currentVersion: true } },
  pinnedVersion: true,
} satisfies Prisma.ActivityQuestionInclude;

type ActivityQuestionWithContent = Prisma.ActivityQuestionGetPayload<{
  include: typeof activityQuestionInclude;
}>;

/**
 * Resolves an ActivityQuestion's gradable content: prefers the pinned
 * version (set once, at publish time) and falls back to the question's
 * live current version while the parent activity is still a draft.
 * This is the single function all read paths go through, so the
 * pin-vs-live behavior can never diverge between the builder, the
 * preview, and the detail endpoint.
 */
function resolveContent(aq: ActivityQuestionWithContent) {
  const version = aq.pinnedVersion ?? aq.question.currentVersion;
  return {
    activityQuestionId: aq.id,
    questionId: aq.questionId,
    order: aq.order,
    pinned: aq.pinnedVersionId !== null,
    type: version!.type,
    prompt: version!.prompt,
    points: version!.points,
    hint: version!.hint,
    explanation: version!.explanation,
    options: version!.options,
    correctAnswer: version!.correctAnswer,
  };
}

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityLogger: SecurityLogger,
  ) {}

  async create(ctx: TeacherContext, dto: CreateActivityDto) {
    const created = await this.prisma.activity.create({
      data: { tenantId: ctx.tenantId, teacherId: ctx.userId, title: dto.title.trim() },
    });

    this.securityLogger.log("activity_created", {
      activityId: created.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    return created;
  }

  async findAllForTeacher(ctx: TeacherContext, includeArchived = false) {
    const activities = await this.prisma.activity.findMany({
      where: {
        tenantId: ctx.tenantId,
        teacherId: ctx.userId,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { questions: true } } },
    });

    return activities.map((a) => ({
      id: a.id,
      title: a.title,
      status: a.status,
      publishedAt: a.publishedAt,
      createdAt: a.createdAt,
      archivedAt: a.archivedAt,
      questionCount: a._count.questions,
    }));
  }

  /**
   * Scoped by tenant AND owning teacher, matching classes/questions.
   * A cross-tenant/nonexistent activity 404s, never a distinct 403.
   */
  private async findOwnedOrThrow(ctx: TeacherContext, activityId: string) {
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, tenantId: ctx.tenantId, teacherId: ctx.userId },
      include: {
        questions: { orderBy: { order: "asc" }, include: activityQuestionInclude },
      },
    });

    if (!activity) {
      throw new NotFoundException("Activity not found.");
    }

    return activity;
  }

  async findOne(ctx: TeacherContext, activityId: string) {
    const activity = await this.findOwnedOrThrow(ctx, activityId);
    return {
      id: activity.id,
      title: activity.title,
      status: activity.status,
      publishedAt: activity.publishedAt,
      createdAt: activity.createdAt,
      archivedAt: activity.archivedAt,
      questions: activity.questions.map(resolveContent),
    };
  }

  private assertDraft(activity: { status: string }) {
    if (activity.status !== "draft") {
      throw new BadRequestException("This activity is published and can no longer be changed.");
    }
  }

  async update(ctx: TeacherContext, activityId: string, dto: UpdateActivityDto) {
    const activity = await this.findOwnedOrThrow(ctx, activityId);
    this.assertDraft(activity);

    const updated = await this.prisma.activity.update({
      where: { id: activity.id },
      data: { title: dto.title.trim() },
    });

    this.securityLogger.log("activity_updated", {
      activityId: updated.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    return this.findOne(ctx, activityId);
  }

  async addQuestion(ctx: TeacherContext, activityId: string, dto: AddActivityQuestionDto) {
    const activity = await this.findOwnedOrThrow(ctx, activityId);
    this.assertDraft(activity);

    const question = await this.prisma.question.findFirst({
      where: { id: dto.questionId, tenantId: ctx.tenantId, teacherId: ctx.userId, archivedAt: null },
    });
    if (!question) {
      throw new NotFoundException("Question not found.");
    }

    const nextOrder = activity.questions.length > 0 ? Math.max(...activity.questions.map((q) => q.order)) + 1 : 0;

    const created = await this.prisma.activityQuestion.create({
      data: {
        tenantId: ctx.tenantId,
        activityId: activity.id,
        questionId: question.id,
        order: nextOrder,
      },
    });

    this.securityLogger.log("activity_question_added", {
      activityId: activity.id,
      activityQuestionId: created.id,
      questionId: question.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    return this.findOne(ctx, activityId);
  }

  async removeQuestion(ctx: TeacherContext, activityId: string, activityQuestionId: string) {
    const activity = await this.findOwnedOrThrow(ctx, activityId);
    this.assertDraft(activity);

    const aq = activity.questions.find((q) => q.id === activityQuestionId);
    if (!aq) {
      throw new NotFoundException("Activity question not found.");
    }

    await this.prisma.activityQuestion.delete({ where: { id: aq.id } });

    this.securityLogger.log("activity_question_removed", {
      activityId: activity.id,
      activityQuestionId: aq.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    return this.findOne(ctx, activityId);
  }

  async reorder(ctx: TeacherContext, activityId: string, dto: ReorderActivityQuestionsDto) {
    const activity = await this.findOwnedOrThrow(ctx, activityId);
    this.assertDraft(activity);

    const currentIds = activity.questions.map((q) => q.id).sort();
    const requestedIds = [...dto.activityQuestionIds].sort();
    const sameSet =
      currentIds.length === requestedIds.length && currentIds.every((id, i) => id === requestedIds[i]);

    if (!sameSet) {
      throw new BadRequestException(
        "The reorder list must contain exactly the activity's current questions, no more and no less.",
      );
    }

    await this.prisma.$transaction(
      dto.activityQuestionIds.map((id, index) =>
        this.prisma.activityQuestion.update({ where: { id }, data: { order: index } }),
      ),
    );

    this.securityLogger.log("activity_reordered", {
      activityId: activity.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    return this.findOne(ctx, activityId);
  }

  /**
   * The core correctness-critical transition. Rejects an empty
   * activity and rejects re-publishing (a one-time transition, never
   * reversible — see module brief).
   *
   * The draft->published transition is claimed the same way
   * `AttemptsService.submit()` claims in_progress->submitted: a
   * conditional `updateMany` (`where: { status: "draft" }`) inside the
   * transaction, not a read-then-check-then-write. A plain read of
   * `activity.status` before the transaction (the previous shape) lets
   * two concurrent publish requests both observe "draft" and both
   * proceed to write, double-firing the security log and redundantly
   * re-pinning; the conditional write makes only one caller able to
   * flip the row, and every other caller — including this exact
   * request racing itself — sees `count === 0` and gets the same 400
   * a sequential re-publish would.
   *
   * The winner pins every ActivityQuestion row to its question's
   * CURRENT currentVersionId at this exact moment, inside the same
   * transaction as the claim. From then on, resolveContent() always
   * prefers pinnedVersionId, so later edits to the underlying
   * questions (which always create new versions per Module 3) never
   * change what this activity shows.
   */
  async publish(ctx: TeacherContext, activityId: string) {
    const activity = await this.findOwnedOrThrow(ctx, activityId);

    if (activity.questions.length === 0) {
      throw new BadRequestException("Publish requires at least one question.");
    }

    const won = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.activity.updateMany({
        where: { id: activity.id, status: "draft" },
        data: { status: "published", publishedAt: new Date() },
      });

      if (claim.count === 0) {
        return false;
      }

      for (const aq of activity.questions) {
        const question = await tx.question.findUniqueOrThrow({ where: { id: aq.questionId } });
        await tx.activityQuestion.update({
          where: { id: aq.id },
          data: { pinnedVersionId: question.currentVersionId },
        });
      }

      return true;
    });

    if (!won) {
      throw new BadRequestException("This activity has already been published.");
    }

    this.securityLogger.log("activity_published", {
      activityId: activity.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      questionCount: activity.questions.length,
    });

    return this.findOne(ctx, activityId);
  }

  /**
   * Archiving is visibility-only and allowed regardless of status
   * (draft or published) — it never touches ActivityQuestion rows or
   * pinned versions.
   */
  async archive(ctx: TeacherContext, activityId: string) {
    const activity = await this.findOwnedOrThrow(ctx, activityId);

    const updated = await this.prisma.activity.update({
      where: { id: activity.id },
      data: { archivedAt: new Date() },
    });

    this.securityLogger.log("activity_archived", {
      activityId: updated.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    return this.findOne(ctx, activityId);
  }
}
