import { Injectable } from "@nestjs/common";
import { BadgeType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MasteryService } from "../mastery/mastery.service";
import { levelForXp, xpForAttempt } from "./gamification-formula";

export interface GamificationContext {
  tenantId: string;
  learnerId: string;
}

export interface AwardForAttemptInput {
  attemptId: string;
  totalAwardedPoints: number;
  score: number; // 0..1, this attempt's overallScore
  touchedConceptIds: string[]; // concept ids tagged on this attempt's graded questions
}

export interface GamificationProfile {
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  badges: { badgeType: BadgeType; awardedAt: Date }[];
}

@Injectable()
export class GamificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly masteryService: MasteryService,
  ) {}

  /**
   * Called from inside `AttemptsService.submit()`'s existing grading
   * transaction, right after mastery evidence has been recorded —
   * never in a second transaction, mirroring `MasteryService`'s
   * established pattern.
   *
   * The `XpTransaction` insert relies on `attemptId`'s `@unique`
   * constraint for idempotency rather than a defensive try/catch: the
   * same "only the winning claim in submit()'s atomic-claim pattern
   * ever reaches this code" argument that already makes duplicate
   * `MasteryEvidence` inserts unreachable applies here too, so a
   * unique-violation on this insert would mean that invariant broke —
   * it should fail loudly, not be silently swallowed.
   */
  async awardForAttempt(
    tx: Prisma.TransactionClient,
    ctx: GamificationContext,
    input: AwardForAttemptInput,
  ): Promise<void> {
    const amount = xpForAttempt(input.totalAwardedPoints);
    await tx.xpTransaction.create({
      data: { tenantId: ctx.tenantId, learnerId: ctx.learnerId, attemptId: input.attemptId, amount },
    });

    const submittedCount = await tx.attempt.count({
      where: { tenantId: ctx.tenantId, learnerId: ctx.learnerId, status: "submitted" },
    });

    const existingBadges = await tx.learnerBadge.findMany({
      where: { tenantId: ctx.tenantId, learnerId: ctx.learnerId },
      select: { badgeType: true },
    });
    const existing = new Set(existingBadges.map((b) => b.badgeType));

    const toAward: BadgeType[] = [];

    // quest_starter: this is the learner's first-ever submitted
    // attempt (count === 1 only the very first time, since this call
    // only happens after the claim that just transitioned the current
    // attempt to submitted).
    if (submittedCount === 1) {
      toAward.push("quest_starter");
    }

    if (input.score === 1 && !existing.has("perfect_score")) {
      toAward.push("perfect_score");
    }

    if (submittedCount === 5) {
      toAward.push("persistent_learner");
    }

    // concept_champion: award-once, so once the learner has it, there
    // is no need to re-check mastery state on every later attempt.
    if (!existing.has("concept_champion") && input.touchedConceptIds.length > 0) {
      const states = await this.masteryService.getMasteryForLearnerInTx(
        tx,
        { userId: ctx.learnerId, tenantId: ctx.tenantId },
        input.touchedConceptIds,
      );
      if (states.some((s) => s.state === "mastered")) {
        toAward.push("concept_champion");
      }
    }

    if (!existing.has("rising_star")) {
      // Includes the XpTransaction row just inserted above — same tx,
      // same transaction client, so the aggregate sees its own write.
      const totalAgg = await tx.xpTransaction.aggregate({
        where: { tenantId: ctx.tenantId, learnerId: ctx.learnerId },
        _sum: { amount: true },
      });
      const totalXp = totalAgg._sum.amount ?? 0;
      if (levelForXp(totalXp).level >= 5) {
        toAward.push("rising_star");
      }
    }

    if (toAward.length > 0) {
      await tx.learnerBadge.createMany({
        data: toAward.map((badgeType) => ({ tenantId: ctx.tenantId, learnerId: ctx.learnerId, badgeType })),
        skipDuplicates: true,
      });
    }
  }

  /** Learner-facing read: total XP, level progress, and every earned badge. */
  async getProfile(ctx: { userId: string; tenantId: string }): Promise<GamificationProfile> {
    const [agg, badges] = await Promise.all([
      this.prisma.xpTransaction.aggregate({
        where: { tenantId: ctx.tenantId, learnerId: ctx.userId },
        _sum: { amount: true },
      }),
      this.prisma.learnerBadge.findMany({
        where: { tenantId: ctx.tenantId, learnerId: ctx.userId },
        orderBy: { awardedAt: "asc" },
      }),
    ]);

    const totalXp = agg._sum.amount ?? 0;
    const progress = levelForXp(totalXp);

    return {
      totalXp,
      level: progress.level,
      xpIntoLevel: progress.xpIntoLevel,
      xpForNextLevel: progress.xpForNextLevel,
      badges: badges.map((b) => ({ badgeType: b.badgeType, awardedAt: b.awardedAt })),
    };
  }
}
