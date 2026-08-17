import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityLogger } from "../auth/security-logger.service";
import { MasteryService } from "../mastery/mastery.service";
import { GamificationService } from "../gamification/gamification.service";
import { scoreQuestion, overallScore } from "./scoring";
import { AutosaveResponseDto } from "./dto/autosave-response.dto";

export interface LearnerContext {
  userId: string;
  tenantId: string;
}

const activityQuestionWithPinned = {
  pinnedVersion: true,
} satisfies Prisma.ActivityQuestionInclude;

@Injectable()
export class AttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityLogger: SecurityLogger,
    private readonly masteryService: MasteryService,
    private readonly gamificationService: GamificationService,
  ) {}

  /**
   * Resolves an attempt's full question content, always through
   * `ActivityQuestion.pinnedVersionId` — never the question's live
   * `currentVersionId`. Since assignments can only be created from a
   * PUBLISHED activity (Module 5 decision), `pinnedVersionId` should
   * be structurally impossible to find null here; if it ever is, this
   * throws rather than silently falling back to live content, per the
   * deliberate fail-loud design decision.
   *
   * Strips `correctAnswer`/`isCorrect`/`pointsAwarded` from every
   * question unless the attempt is `submitted` — this is the
   * answer-key protection boundary, enforced here at the
   * service/serialization layer rather than left to the frontend.
   */
  private async loadAttemptDetail(ctx: LearnerContext, attemptId: string) {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id: attemptId, tenantId: ctx.tenantId, learnerId: ctx.userId },
      include: { responses: true, assignment: true },
    });
    if (!attempt) {
      throw new NotFoundException("Attempt not found.");
    }

    const activityQuestions = await this.prisma.activityQuestion.findMany({
      where: { activityId: attempt.assignment.activityId },
      orderBy: { order: "asc" },
      include: activityQuestionWithPinned,
    });

    const responsesByAQ = new Map(attempt.responses.map((r) => [r.activityQuestionId, r]));
    const isSubmitted = attempt.status === "submitted";

    const questions = activityQuestions.map((aq) => {
      if (!aq.pinnedVersionId || !aq.pinnedVersion) {
        throw new Error(
          `Attempt ${attempt.id} grades against ActivityQuestion ${aq.id}, which has no pinnedVersionId. ` +
            "This should be structurally impossible for an assignment created from a published activity.",
        );
      }
      const version = aq.pinnedVersion;
      const response = responsesByAQ.get(aq.id);

      const base = {
        activityQuestionId: aq.id,
        questionId: aq.questionId,
        order: aq.order,
        type: version.type,
        prompt: version.prompt,
        points: version.points,
        hint: version.hint,
        explanation: version.explanation,
        options: version.options,
        responseValue: response?.responseValue ?? null,
        hintViewed: response?.hintViewed ?? false,
      };

      if (!isSubmitted) {
        return base;
      }

      return {
        ...base,
        correctAnswer: version.correctAnswer,
        isCorrect: response?.isCorrect ?? null,
        pointsAwarded: response?.pointsAwarded ?? null,
      };
    });

    return {
      id: attempt.id,
      assignmentId: attempt.assignmentId,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      score: attempt.score,
      questions,
    };
  }

  /**
   * Idempotent: returns the existing Attempt (whatever its status) on
   * a repeat call rather than creating a duplicate. On first call
   * only, creates the Attempt plus one empty AttemptResponse per
   * ActivityQuestion.
   *
   * A learner without an active roster entry for the assignment's
   * class 404s rather than 403s. This is a judgment call: the learner
   * DOES already know the assignment exists (it would only be linked
   * from their own dashboard), so a 404 here isn't hiding existence
   * the way it does for a teacher probing another tenant's resource
   * id. It's still the right choice for consistency: every other
   * "not yours" case in this codebase (classes, questions, activities)
   * 404s rather than 403s, and a learner who has been removed from a
   * class shouldn't get a response shape that confirms the assignment
   * row still exists and is otherwise reachable — 403 would leak that
   * distinction where 404 doesn't.
   */
  async start(ctx: LearnerContext, assignmentId: string) {
    const assignment = await this.prisma.assignment.findFirst({
      where: { id: assignmentId, tenantId: ctx.tenantId, archivedAt: null },
    });
    if (!assignment) {
      throw new NotFoundException("Assignment not found.");
    }

    const roster = await this.prisma.rosterEntry.findFirst({
      where: { classId: assignment.classId, userId: ctx.userId, removedAt: null },
    });
    if (!roster) {
      throw new NotFoundException("Assignment not found.");
    }

    const existing = await this.prisma.attempt.findUnique({
      where: { assignmentId_learnerId: { assignmentId: assignment.id, learnerId: ctx.userId } },
    });
    if (existing) {
      return this.loadAttemptDetail(ctx, existing.id);
    }

    const activityQuestions = await this.prisma.activityQuestion.findMany({
      where: { activityId: assignment.activityId },
      orderBy: { order: "asc" },
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const attempt = await tx.attempt.create({
        data: {
          tenantId: ctx.tenantId,
          assignmentId: assignment.id,
          learnerId: ctx.userId,
          status: "in_progress",
        },
      });

      await tx.attemptResponse.createMany({
        data: activityQuestions.map((aq) => ({
          tenantId: ctx.tenantId,
          attemptId: attempt.id,
          activityQuestionId: aq.id,
          responseValue: Prisma.JsonNull,
        })),
      });

      return attempt;
    });

    this.securityLogger.log("attempt_started", {
      attemptId: created.id,
      assignmentId: assignment.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    return this.loadAttemptDetail(ctx, created.id);
  }

  async getOne(ctx: LearnerContext, attemptId: string) {
    return this.loadAttemptDetail(ctx, attemptId);
  }

  async autosaveResponse(
    ctx: LearnerContext,
    attemptId: string,
    activityQuestionId: string,
    dto: AutosaveResponseDto,
  ) {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id: attemptId, tenantId: ctx.tenantId, learnerId: ctx.userId },
    });
    if (!attempt) {
      throw new NotFoundException("Attempt not found.");
    }
    if (attempt.status !== "in_progress") {
      throw new BadRequestException("This attempt is locked and can no longer be edited.");
    }

    const response = await this.prisma.attemptResponse.findFirst({
      where: { attemptId: attempt.id, activityQuestionId, tenantId: ctx.tenantId },
    });
    if (!response) {
      throw new NotFoundException("Attempt response not found.");
    }

    const data: Prisma.AttemptResponseUpdateInput = {};

    // Only touch responseValue when the key was actually present in
    // the request body — this same endpoint doubles as the
    // hint-reveal call (`{ hintViewed: true }` with no responseValue
    // at all), which must never clobber the learner's already-saved
    // answer back to null.
    if ("responseValue" in dto) {
      data.responseValue = dto.responseValue === undefined ? Prisma.JsonNull : (dto.responseValue as Prisma.InputJsonValue);
    }

    // Once true, never reset back to false — only ever write true, and
    // only when it's not already true, so a hint viewed earlier in the
    // attempt stays viewed regardless of what later autosave calls send.
    if (dto.hintViewed === true && !response.hintViewed) {
      data.hintViewed = true;
    }

    if (Object.keys(data).length === 0) {
      return { activityQuestionId: response.activityQuestionId, responseValue: response.responseValue, hintViewed: response.hintViewed };
    }

    const updated = await this.prisma.attemptResponse.update({
      where: { id: response.id },
      data,
    });

    return { activityQuestionId: updated.activityQuestionId, responseValue: updated.responseValue, hintViewed: updated.hintViewed };
  }

  /**
   * The atomic claim pattern: an `updateMany` conditioned on the
   * current status is the only write that can transition an attempt
   * to `submitted`, and it happens INSIDE the same transaction as
   * grading — not as a separate statement before it. That matters for
   * true concurrency (two requests racing via `Promise.all`, not just
   * sequential duplicates): if the claim and the grade were two
   * separate round trips, a losing request could read the attempt
   * back after the winner's claim commits but before the winner's
   * grading transaction commits, observing `status: "submitted"` with
   * a still-null `score`. Doing both inside one transaction means
   * Postgres's row lock on the `Attempt` row forces the loser's own
   * `updateMany` to block until the winner's transaction fully
   * commits, so by the time the loser sees `count === 0` the winner's
   * grade is guaranteed to be visible already.
   *
   * Only the caller that wins the claim (`count === 1`) grades; every
   * other caller — a genuine duplicate request or this same request
   * racing itself — sees `count === 0` and returns the already-graded
   * result unchanged. This makes duplicate submit a normal idempotent
   * success, never an error, and makes double grading structurally
   * impossible rather than merely unlikely.
   */
  async submit(ctx: LearnerContext, attemptId: string) {
    const attempt = await this.prisma.attempt.findFirst({
      where: { id: attemptId, tenantId: ctx.tenantId, learnerId: ctx.userId },
    });
    if (!attempt) {
      throw new NotFoundException("Attempt not found.");
    }

    const won = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.attempt.updateMany({
        where: { id: attempt.id, status: "in_progress" },
        data: { status: "submitted", submittedAt: new Date() },
      });

      if (claim.count === 0) {
        // Someone else (or this exact request, racing itself) already
        // won the claim. Do not re-grade.
        return false;
      }

      const assignment = await tx.assignment.findUniqueOrThrow({ where: { id: attempt.assignmentId } });
      const questions = await tx.activityQuestion.findMany({
        where: { activityId: assignment.activityId },
        orderBy: { order: "asc" },
        include: activityQuestionWithPinned,
      });
      const responses = await tx.attemptResponse.findMany({ where: { attemptId: attempt.id } });
      const responsesByAQ = new Map(responses.map((r) => [r.activityQuestionId, r]));

      const graded: { activityQuestionId: string; pointsAwarded: number; points: number }[] = [];
      const gradedForEvidence: {
        attemptResponseId: string;
        questionId: string;
        pointsAwarded: number;
        points: number;
        hintViewed: boolean;
      }[] = [];

      for (const aq of questions) {
        if (!aq.pinnedVersionId || !aq.pinnedVersion) {
          throw new Error(
            `Attempt ${attempt.id} grades against ActivityQuestion ${aq.id}, which has no pinnedVersionId. ` +
              "This should be structurally impossible for an assignment created from a published activity.",
          );
        }
        const response = responsesByAQ.get(aq.id);
        const version = aq.pinnedVersion;
        const result = scoreQuestion(
          { type: version.type, points: version.points, options: version.options, correctAnswer: version.correctAnswer },
          response?.responseValue ?? null,
        );

        if (response) {
          const updatedResponse = await tx.attemptResponse.update({
            where: { id: response.id },
            data: { isCorrect: result.isCorrect, pointsAwarded: result.pointsAwarded },
          });
          gradedForEvidence.push({
            attemptResponseId: updatedResponse.id,
            questionId: aq.questionId,
            pointsAwarded: result.pointsAwarded,
            points: version.points,
            hintViewed: updatedResponse.hintViewed,
          });
        }

        graded.push({ activityQuestionId: aq.id, pointsAwarded: result.pointsAwarded, points: version.points });
      }

      const score = overallScore(graded);
      await tx.attempt.update({ where: { id: attempt.id }, data: { score } });

      // Mastery evidence recording happens INSIDE this same grading
      // transaction, right after scoring, per the submission pipeline
      // (Master Spec §10): "responses graded -> score computed ->
      // mastery evidence recorded" — never a second transaction, and
      // reached only by the winning claim above.
      const touchedConceptIds = await this.masteryService.recordEvidenceForAttempt(
        tx,
        { tenantId: ctx.tenantId, learnerId: ctx.userId },
        gradedForEvidence,
      );

      // Gamification (Module 7) awards XP/badges right after mastery
      // evidence, still inside the same grading transaction and still
      // reached only by the winning claim — same idempotency argument
      // as MasteryEvidence above. touchedConceptIds comes straight
      // from the mastery recording call above rather than a second,
      // duplicate QuestionConcept lookup.
      const totalAwardedPoints = graded.reduce((sum, g) => sum + g.pointsAwarded, 0);
      await this.gamificationService.awardForAttempt(
        tx,
        { tenantId: ctx.tenantId, learnerId: ctx.userId },
        { attemptId: attempt.id, totalAwardedPoints, score, touchedConceptIds },
      );

      return true;
    });

    if (won) {
      this.securityLogger.log("attempt_submitted", {
        attemptId: attempt.id,
        assignmentId: attempt.assignmentId,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
      });
    }

    return this.loadAttemptDetail(ctx, attempt.id);
  }
}
