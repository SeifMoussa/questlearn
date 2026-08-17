-- CreateEnum
CREATE TYPE "BadgeType" AS ENUM ('quest_starter', 'perfect_score', 'concept_champion', 'persistent_learner', 'rising_star');

-- CreateTable
CREATE TABLE "xp_transactions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "learner_id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xp_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learner_badges" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "learner_id" TEXT NOT NULL,
    "badge_type" "BadgeType" NOT NULL,
    "awarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learner_badges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "xp_transactions_attempt_id_key" ON "xp_transactions"("attempt_id");

-- CreateIndex
CREATE INDEX "xp_transactions_tenant_id_idx" ON "xp_transactions"("tenant_id");

-- CreateIndex
CREATE INDEX "xp_transactions_learner_id_idx" ON "xp_transactions"("learner_id");

-- CreateIndex
CREATE INDEX "learner_badges_tenant_id_idx" ON "learner_badges"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "learner_badges_learner_id_badge_type_key" ON "learner_badges"("learner_id", "badge_type");

-- AddForeignKey
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_badges" ADD CONSTRAINT "learner_badges_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_badges" ADD CONSTRAINT "learner_badges_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
