import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityLogger } from "../auth/security-logger.service";
import { MasteryService } from "../mastery/mastery.service";
import type { MasteryState } from "../mastery/mastery-formula";
import { isQuestComplete, isStepComplete, meetsMasteryThreshold, unlockedStepCount, xpForQuestCompletion } from "./quest-formula";
import { CreateQuestDto, QuestStepGateDto, ReorderQuestStepsDto, UpdateQuestDto } from "./dto/quest.dto";

export interface TeacherContext {
  userId: string;
  tenantId: string;
}

export interface LearnerContext {
  userId: string;
  tenantId: string;
}

type QuestWithSteps = Prisma.QuestGetPayload<{ include: { steps: true } }>;
type QuestStepRow = QuestWithSteps["steps"][number];

@Injectable()
export class QuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityLogger: SecurityLogger,
    private readonly masteryService: MasteryService,
  ) {}

  // ---------------------------------------------------------------
  // Teacher: quest CRUD
  // ---------------------------------------------------------------

  async create(ctx: TeacherContext, dto: CreateQuestDto) {
    const created = await this.prisma.quest.create({
      data: { tenantId: ctx.tenantId, teacherId: ctx.userId, title: dto.title.trim(), description: dto.description?.trim() },
    });

    this.securityLogger.log("quest_created", { questId: created.id, tenantId: ctx.tenantId, userId: ctx.userId });

    return this.findOneForTeacher(ctx, created.id);
  }

  async findAllForTeacher(ctx: TeacherContext) {
    const quests = await this.prisma.quest.findMany({
      where: { tenantId: ctx.tenantId, teacherId: ctx.userId, archivedAt: null },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { steps: true } } },
    });

    return quests.map((q) => ({
      id: q.id,
      title: q.title,
      description: q.description,
      createdAt: q.createdAt,
      archivedAt: q.archivedAt,
      stepCount: q._count.steps,
    }));
  }

  /** Scoped by tenant AND owning teacher. A cross-tenant/nonexistent quest 404s, never a distinct 403. */
  private async findOwnedOrThrow(ctx: TeacherContext, questId: string): Promise<QuestWithSteps> {
    const quest = await this.prisma.quest.findFirst({
      where: { id: questId, tenantId: ctx.tenantId, teacherId: ctx.userId },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    if (!quest) {
      throw new NotFoundException("Quest not found.");
    }
    return quest;
  }

  async findOneForTeacher(ctx: TeacherContext, questId: string) {
    const quest = await this.findOwnedOrThrow(ctx, questId);
    return this.serializeQuestForTeacher(quest);
  }

  private serializeQuestForTeacher(quest: QuestWithSteps) {
    return {
      id: quest.id,
      title: quest.title,
      description: quest.description,
      createdAt: quest.createdAt,
      archivedAt: quest.archivedAt,
      steps: quest.steps.map((s) => ({
        id: s.id,
        order: s.order,
        activityId: s.activityId,
        requiredConceptId: s.requiredConceptId,
        requiredMasteryState: s.requiredMasteryState,
      })),
    };
  }

  async update(ctx: TeacherContext, questId: string, dto: UpdateQuestDto) {
    await this.findOwnedOrThrow(ctx, questId);

    await this.prisma.quest.update({
      where: { id: questId },
      data: { title: dto.title.trim(), description: dto.description?.trim() },
    });

    this.securityLogger.log("quest_updated", { questId, tenantId: ctx.tenantId, userId: ctx.userId });

    return this.findOneForTeacher(ctx, questId);
  }

  /** Archiving is visibility-only, allowed regardless of step count, matching Activity/Class/Question. */
  async archive(ctx: TeacherContext, questId: string) {
    await this.findOwnedOrThrow(ctx, questId);

    await this.prisma.quest.update({ where: { id: questId }, data: { archivedAt: new Date() } });

    this.securityLogger.log("quest_archived", { questId, tenantId: ctx.tenantId, userId: ctx.userId });

    return this.findOneForTeacher(ctx, questId);
  }

  // ---------------------------------------------------------------
  // Teacher: step CRUD
  // ---------------------------------------------------------------

  /**
   * At least one gate must be present — a step with neither is
   * vacuously always-complete, which is meaningless. Not expressible
   * as a class-validator decorator since it spans multiple optional
   * fields, so it's enforced here, matching `ActivitiesService`'s
   * posture on cross-field rules.
   */
  private async validateGateDto(ctx: TeacherContext, dto: QuestStepGateDto) {
    const hasActivityGate = !!dto.activityId;
    const hasMasteryGate = !!dto.requiredConceptId || !!dto.requiredMasteryState;

    if (!hasActivityGate && !hasMasteryGate) {
      throw new BadRequestException("A quest step needs an activity, a mastery threshold, or both.");
    }
    if ((!!dto.requiredConceptId) !== (!!dto.requiredMasteryState)) {
      throw new BadRequestException("A mastery gate needs both a concept and a required mastery state.");
    }

    if (dto.activityId) {
      const activity = await this.prisma.activity.findFirst({
        where: { id: dto.activityId, tenantId: ctx.tenantId, status: "published", archivedAt: null },
      });
      if (!activity) {
        throw new BadRequestException("activityId must reference a published, non-archived activity you own.");
      }
    }
    if (dto.requiredConceptId) {
      const concept = await this.prisma.concept.findFirst({
        where: { id: dto.requiredConceptId, tenantId: ctx.tenantId, archivedAt: null },
      });
      if (!concept) {
        throw new BadRequestException("requiredConceptId must reference a non-archived concept you own.");
      }
    }
  }

  async addStep(ctx: TeacherContext, questId: string, dto: QuestStepGateDto) {
    const quest = await this.findOwnedOrThrow(ctx, questId);
    await this.validateGateDto(ctx, dto);

    const nextOrder = quest.steps.length > 0 ? Math.max(...quest.steps.map((s) => s.order)) + 1 : 1;

    const created = await this.prisma.questStep.create({
      data: {
        tenantId: ctx.tenantId,
        questId: quest.id,
        order: nextOrder,
        activityId: dto.activityId,
        requiredConceptId: dto.requiredConceptId,
        requiredMasteryState: dto.requiredMasteryState,
      },
    });

    this.securityLogger.log("quest_step_added", {
      questId: quest.id,
      stepId: created.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    return this.findOneForTeacher(ctx, questId);
  }

  async updateStep(ctx: TeacherContext, questId: string, stepId: string, dto: QuestStepGateDto) {
    const quest = await this.findOwnedOrThrow(ctx, questId);
    const step = quest.steps.find((s) => s.id === stepId);
    if (!step) {
      throw new NotFoundException("Quest step not found.");
    }
    await this.validateGateDto(ctx, dto);

    await this.prisma.questStep.update({
      where: { id: step.id },
      data: {
        activityId: dto.activityId ?? null,
        requiredConceptId: dto.requiredConceptId ?? null,
        requiredMasteryState: dto.requiredMasteryState ?? null,
      },
    });

    this.securityLogger.log("quest_step_updated", {
      questId: quest.id,
      stepId: step.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    return this.findOneForTeacher(ctx, questId);
  }

  async removeStep(ctx: TeacherContext, questId: string, stepId: string) {
    const quest = await this.findOwnedOrThrow(ctx, questId);
    const step = quest.steps.find((s) => s.id === stepId);
    if (!step) {
      throw new NotFoundException("Quest step not found.");
    }

    await this.prisma.questStep.delete({ where: { id: step.id } });

    this.securityLogger.log("quest_step_removed", {
      questId: quest.id,
      stepId: step.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    return this.findOneForTeacher(ctx, questId);
  }

  async reorderSteps(ctx: TeacherContext, questId: string, dto: ReorderQuestStepsDto) {
    const quest = await this.findOwnedOrThrow(ctx, questId);

    const currentIds = quest.steps.map((s) => s.id).sort();
    const requestedIds = [...dto.stepIds].sort();
    const sameSet = currentIds.length === requestedIds.length && currentIds.every((id, i) => id === requestedIds[i]);
    if (!sameSet) {
      throw new BadRequestException("The reorder list must contain exactly the quest's current steps, no more and no less.");
    }

    await this.prisma.$transaction(
      dto.stepIds.map((id, index) => this.prisma.questStep.update({ where: { id }, data: { order: index + 1 } })),
    );

    this.securityLogger.log("quest_reordered", { questId: quest.id, tenantId: ctx.tenantId, userId: ctx.userId });

    return this.findOneForTeacher(ctx, questId);
  }

  // ---------------------------------------------------------------
  // Shared gate-evaluation core (used by both the learner read paths
  // and the in-transaction completion check). Split into a data-free
  // evaluator plus two data-fetching wrappers — one against
  // `this.prisma`, one against a transaction client — mirroring
  // `MasteryService`'s own `getMasteryForLearner` /
  // `getMasteryForLearnerInTx` split rather than duck-typing which
  // kind of client was passed in.
  // ---------------------------------------------------------------

  private evaluateSteps(
    steps: QuestStepRow[],
    submittedActivityIds: Set<string>,
    masteryByConceptId: Map<string, MasteryState>,
  ): boolean[] {
    return steps.map((step) => {
      const activityGateSatisfied = step.activityId ? submittedActivityIds.has(step.activityId) : null;
      const masteryGateSatisfied =
        step.requiredConceptId && step.requiredMasteryState
          ? meetsMasteryThreshold(
              masteryByConceptId.get(step.requiredConceptId) ?? "not_started",
              step.requiredMasteryState as MasteryState,
            )
          : null;
      return isStepComplete({ activityGateSatisfied, masteryGateSatisfied });
    });
  }

  private async fetchSubmittedActivityIds(
    client: PrismaService | Prisma.TransactionClient,
    ctx: LearnerContext,
    activityIds: string[],
  ): Promise<Set<string>> {
    if (activityIds.length === 0) return new Set();
    const submittedAttempts = await client.attempt.findMany({
      where: {
        tenantId: ctx.tenantId,
        learnerId: ctx.userId,
        status: "submitted",
        assignment: { activityId: { in: activityIds } },
      },
      select: { assignment: { select: { activityId: true } } },
    });
    return new Set(submittedAttempts.map((a) => a.assignment.activityId));
  }

  private conceptIdsOf(steps: QuestStepRow[]): string[] {
    return Array.from(new Set(steps.map((s) => s.requiredConceptId).filter((id): id is string => !!id)));
  }

  private activityIdsOf(steps: QuestStepRow[]): string[] {
    return Array.from(new Set(steps.map((s) => s.activityId).filter((id): id is string => !!id)));
  }

  /** Live read path — used by the learner-facing quest list/progress endpoints. */
  private async computeStepCompletionsLive(ctx: LearnerContext, steps: QuestStepRow[]): Promise<boolean[]> {
    const conceptIds = this.conceptIdsOf(steps);
    const [submittedActivityIds, masteryResults] = await Promise.all([
      this.fetchSubmittedActivityIds(this.prisma, ctx, this.activityIdsOf(steps)),
      conceptIds.length > 0 ? this.masteryService.getMasteryForLearner(ctx, conceptIds) : Promise.resolve([]),
    ]);
    const masteryByConceptId = new Map(masteryResults.map((m) => [m.conceptId, m.state as MasteryState]));
    return this.evaluateSteps(steps, submittedActivityIds, masteryByConceptId);
  }

  /** In-transaction path — used from inside AttemptsService.submit()'s grading transaction. */
  private async computeStepCompletionsInTx(
    tx: Prisma.TransactionClient,
    ctx: LearnerContext,
    steps: QuestStepRow[],
  ): Promise<boolean[]> {
    const conceptIds = this.conceptIdsOf(steps);
    const [submittedActivityIds, masteryResults] = await Promise.all([
      this.fetchSubmittedActivityIds(tx, ctx, this.activityIdsOf(steps)),
      conceptIds.length > 0 ? this.masteryService.getMasteryForLearnerInTx(tx, ctx, conceptIds) : Promise.resolve([]),
    ]);
    const masteryByConceptId = new Map(masteryResults.map((m) => [m.conceptId, m.state as MasteryState]));
    return this.evaluateSteps(steps, submittedActivityIds, masteryByConceptId);
  }

  // ---------------------------------------------------------------
  // Learner: tenant-wide quest visibility + live progress
  // ---------------------------------------------------------------

  /** Quests are tenant-wide, not per-class assigned — every learner in the tenant sees every non-archived quest. */
  async findAllForLearner(ctx: LearnerContext) {
    const quests = await this.prisma.quest.findMany({
      where: { tenantId: ctx.tenantId, archivedAt: null },
      orderBy: { createdAt: "asc" },
      include: { steps: { orderBy: { order: "asc" } } },
    });

    const completions = await this.prisma.questCompletion.findMany({
      where: { tenantId: ctx.tenantId, learnerId: ctx.userId, questId: { in: quests.map((q) => q.id) } },
    });
    const completionByQuestId = new Map(completions.map((c) => [c.questId, c]));

    const results = [];
    for (const quest of quests) {
      const completions_ = completionByQuestId.get(quest.id);
      const stepCompletions = completions_ ? quest.steps.map(() => true) : await this.computeStepCompletionsLive(ctx, quest.steps);
      results.push({
        id: quest.id,
        title: quest.title,
        description: quest.description,
        totalSteps: quest.steps.length,
        unlockedStepCount: unlockedStepCount(stepCompletions),
        complete: !!completions_ || isQuestComplete(stepCompletions),
        xpAwarded: completions_?.xpAwarded ?? null,
      });
    }
    return results;
  }

  private async findVisibleOrThrow(ctx: LearnerContext, questId: string): Promise<QuestWithSteps> {
    const quest = await this.prisma.quest.findFirst({
      where: { id: questId, tenantId: ctx.tenantId, archivedAt: null },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    if (!quest) {
      throw new NotFoundException("Quest not found.");
    }
    return quest;
  }

  async getProgress(ctx: LearnerContext, questId: string) {
    const quest = await this.findVisibleOrThrow(ctx, questId);
    const existingCompletion = await this.prisma.questCompletion.findUnique({
      where: { questId_learnerId: { questId: quest.id, learnerId: ctx.userId } },
    });

    const stepCompletions = existingCompletion
      ? quest.steps.map(() => true)
      : await this.computeStepCompletionsLive(ctx, quest.steps);
    const unlocked = unlockedStepCount(stepCompletions);

    return {
      id: quest.id,
      title: quest.title,
      description: quest.description,
      complete: !!existingCompletion || isQuestComplete(stepCompletions),
      xpAwarded: existingCompletion?.xpAwarded ?? null,
      steps: quest.steps.map((s, index) => ({
        id: s.id,
        order: s.order,
        activityId: s.activityId,
        requiredConceptId: s.requiredConceptId,
        requiredMasteryState: s.requiredMasteryState,
        complete: stepCompletions[index],
        unlocked: index < unlocked,
      })),
    };
  }

  // ---------------------------------------------------------------
  // Called from inside AttemptsService.submit()'s existing grading
  // transaction, right after GamificationService.awardForAttempt —
  // see schema.prisma's QuestCompletion doc comment for why this uses
  // skipDuplicates (defense-in-depth) rather than the fail-loud
  // posture XpTransaction uses: a quest's last step can independently
  // become satisfied by two DIFFERENT concurrent attempts, so a
  // unique violation here is a real, expected race, not a broken
  // invariant.
  // ---------------------------------------------------------------

  async evaluateQuestProgressForAttempt(
    tx: Prisma.TransactionClient,
    ctx: LearnerContext,
    input: { activityId: string; touchedConceptIds: string[] },
  ): Promise<void> {
    const candidateQuests = await tx.quest.findMany({
      where: {
        tenantId: ctx.tenantId,
        archivedAt: null,
        steps: {
          some: {
            OR: [{ activityId: input.activityId }, { requiredConceptId: { in: input.touchedConceptIds } }],
          },
        },
      },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    if (candidateQuests.length === 0) return;

    const alreadyCompleted = await tx.questCompletion.findMany({
      where: { tenantId: ctx.tenantId, learnerId: ctx.userId, questId: { in: candidateQuests.map((q) => q.id) } },
      select: { questId: true },
    });
    const alreadyCompletedIds = new Set(alreadyCompleted.map((c) => c.questId));

    const toComplete: { questId: string; xpAwarded: number }[] = [];

    for (const quest of candidateQuests) {
      if (alreadyCompletedIds.has(quest.id)) continue;

      const stepCompletions = await this.computeStepCompletionsInTx(tx, ctx, quest.steps);
      if (isQuestComplete(stepCompletions)) {
        toComplete.push({ questId: quest.id, xpAwarded: xpForQuestCompletion(quest.steps.length) });
      }
    }

    if (toComplete.length === 0) return;

    await tx.questCompletion.createMany({
      data: toComplete.map((c) => ({
        tenantId: ctx.tenantId,
        questId: c.questId,
        learnerId: ctx.userId,
        xpAwarded: c.xpAwarded,
      })),
      skipDuplicates: true,
    });
  }
}
