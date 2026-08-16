import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityLogger } from "../auth/security-logger.service";
import { QuestionPayloadDto } from "./dto/question-payload.dto";
import { UpdateQuestionConceptsDto } from "./dto/update-question-concepts.dto";

export interface TeacherContext {
  userId: string;
  tenantId: string;
}

function versionData(tenantId: string, questionId: string, versionNumber: number, dto: QuestionPayloadDto) {
  return {
    questionId,
    tenantId,
    versionNumber,
    type: dto.type,
    prompt: dto.prompt.trim(),
    points: dto.points ?? 1,
    hint: dto.hint?.trim() || null,
    explanation: dto.explanation?.trim() || null,
    options: (dto.options as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
    correctAnswer: dto.correctAnswer as Prisma.InputJsonValue,
  };
}

@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityLogger: SecurityLogger,
  ) {}

  /**
   * Creates the `Question` and its v1 `QuestionVersion` atomically so
   * `currentVersionId` is never observably null once this resolves,
   * despite being nullable at the schema level (see schema.prisma).
   */
  async create(ctx: TeacherContext, dto: QuestionPayloadDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      const question = await tx.question.create({
        data: { tenantId: ctx.tenantId, teacherId: ctx.userId },
      });

      const version = await tx.questionVersion.create({
        data: versionData(ctx.tenantId, question.id, 1, dto),
      });

      return tx.question.update({
        where: { id: question.id },
        data: { currentVersionId: version.id },
        include: { currentVersion: true },
      });
    });

    this.securityLogger.log("question_created", {
      questionId: result.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    return result;
  }

  async findAllForTeacher(ctx: TeacherContext, includeArchived = false) {
    return this.prisma.question.findMany({
      where: {
        tenantId: ctx.tenantId,
        teacherId: ctx.userId,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: { createdAt: "desc" },
      include: { currentVersion: true },
    });
  }

  /**
   * Scoped by tenant AND owning teacher, matching the classes module's
   * posture. A question outside the caller's tenant/ownership 404s,
   * never 403s.
   */
  private async findOwnedOrThrow(ctx: TeacherContext, questionId: string) {
    const question = await this.prisma.question.findFirst({
      where: { id: questionId, tenantId: ctx.tenantId, teacherId: ctx.userId },
      include: { currentVersion: true, concepts: { include: { concept: true } } },
    });

    if (!question) {
      throw new NotFoundException("Question not found.");
    }

    return question;
  }

  async findOne(ctx: TeacherContext, questionId: string) {
    return this.findOwnedOrThrow(ctx, questionId);
  }

  /**
   * Always creates a new version (see module brief — no conditional
   * "only version if used" check, since nothing can reference a
   * question yet). The prior version row is left untouched and
   * remains queryable.
   */
  async update(ctx: TeacherContext, questionId: string, dto: QuestionPayloadDto) {
    const question = await this.findOwnedOrThrow(ctx, questionId);
    const nextVersionNumber = (question.currentVersion?.versionNumber ?? 0) + 1;

    const result = await this.prisma.$transaction(async (tx) => {
      const version = await tx.questionVersion.create({
        data: versionData(ctx.tenantId, question.id, nextVersionNumber, dto),
      });

      return tx.question.update({
        where: { id: question.id },
        data: { currentVersionId: version.id },
        include: { currentVersion: true },
      });
    });

    this.securityLogger.log("question_edited", {
      questionId: result.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      versionNumber: nextVersionNumber,
    });

    return result;
  }

  async archive(ctx: TeacherContext, questionId: string) {
    const question = await this.findOwnedOrThrow(ctx, questionId);

    const result = await this.prisma.question.update({
      where: { id: question.id },
      data: { archivedAt: new Date() },
      include: { currentVersion: true },
    });

    this.securityLogger.log("question_archived", {
      questionId: result.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    return result;
  }

  /**
   * Full replacement of a question's concept tags. Concepts attach to
   * `Question`, not `QuestionVersion` (see module brief) — this never
   * creates a new version and has no interaction with the versioning
   * system at all. Every id in `dto.conceptIds` must resolve to a
   * non-archived concept owned by the caller's tenant, or the whole
   * request is rejected (no partial application).
   */
  async updateConcepts(ctx: TeacherContext, questionId: string, dto: UpdateQuestionConceptsDto) {
    const question = await this.findOwnedOrThrow(ctx, questionId);

    const uniqueIds = Array.from(new Set(dto.conceptIds));
    if (uniqueIds.length > 0) {
      const owned = await this.prisma.concept.findMany({
        where: { id: { in: uniqueIds }, tenantId: ctx.tenantId, teacherId: ctx.userId },
        select: { id: true },
      });
      if (owned.length !== uniqueIds.length) {
        throw new NotFoundException("One or more concepts were not found.");
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.questionConcept.deleteMany({ where: { questionId: question.id } });
      if (uniqueIds.length > 0) {
        await tx.questionConcept.createMany({
          data: uniqueIds.map((conceptId) => ({
            tenantId: ctx.tenantId,
            questionId: question.id,
            conceptId,
          })),
        });
      }
    });

    this.securityLogger.log("question_concepts_updated", {
      questionId: question.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      conceptCount: uniqueIds.length,
    });

    return this.prisma.questionConcept.findMany({
      where: { questionId: question.id },
      include: { concept: true },
    });
  }
}
