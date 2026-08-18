-- CreateEnum
CREATE TYPE "QuestMasteryThreshold" AS ENUM ('beginning', 'developing', 'proficient', 'mastered');

-- CreateTable
CREATE TABLE "quests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "quests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quest_steps" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "quest_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "activity_id" TEXT,
    "required_concept_id" TEXT,
    "required_mastery_state" "QuestMasteryThreshold",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quest_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quest_completions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "quest_id" TEXT NOT NULL,
    "learner_id" TEXT NOT NULL,
    "xp_awarded" INTEGER NOT NULL,
    "awarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quest_completions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quests_tenant_id_idx" ON "quests"("tenant_id");

-- CreateIndex
CREATE INDEX "quests_teacher_id_idx" ON "quests"("teacher_id");

-- CreateIndex
CREATE INDEX "quest_steps_quest_id_idx" ON "quest_steps"("quest_id");

-- CreateIndex
CREATE INDEX "quest_steps_tenant_id_idx" ON "quest_steps"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "quest_steps_quest_id_order_key" ON "quest_steps"("quest_id", "order");

-- CreateIndex
CREATE INDEX "quest_completions_tenant_id_idx" ON "quest_completions"("tenant_id");

-- CreateIndex
CREATE INDEX "quest_completions_learner_id_idx" ON "quest_completions"("learner_id");

-- CreateIndex
CREATE UNIQUE INDEX "quest_completions_quest_id_learner_id_key" ON "quest_completions"("quest_id", "learner_id");

-- AddForeignKey
ALTER TABLE "quests" ADD CONSTRAINT "quests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quests" ADD CONSTRAINT "quests_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_steps" ADD CONSTRAINT "quest_steps_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_steps" ADD CONSTRAINT "quest_steps_quest_id_fkey" FOREIGN KEY ("quest_id") REFERENCES "quests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_steps" ADD CONSTRAINT "quest_steps_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_steps" ADD CONSTRAINT "quest_steps_required_concept_id_fkey" FOREIGN KEY ("required_concept_id") REFERENCES "concepts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_completions" ADD CONSTRAINT "quest_completions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_completions" ADD CONSTRAINT "quest_completions_quest_id_fkey" FOREIGN KEY ("quest_id") REFERENCES "quests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_completions" ADD CONSTRAINT "quest_completions_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
