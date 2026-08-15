-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('in_progress', 'submitted');

-- AlterTable
ALTER TABLE "roster_entries" ADD COLUMN     "user_id" TEXT;

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "learner_id" TEXT NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'in_progress',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_responses" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "activity_question_id" TEXT NOT NULL,
    "response_value" JSONB NOT NULL,
    "is_correct" BOOLEAN,
    "points_awarded" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assignments_tenant_id_idx" ON "assignments"("tenant_id");

-- CreateIndex
CREATE INDEX "assignments_teacher_id_idx" ON "assignments"("teacher_id");

-- CreateIndex
CREATE INDEX "assignments_class_id_idx" ON "assignments"("class_id");

-- CreateIndex
CREATE INDEX "assignments_activity_id_idx" ON "assignments"("activity_id");

-- CreateIndex
CREATE INDEX "attempts_tenant_id_idx" ON "attempts"("tenant_id");

-- CreateIndex
CREATE INDEX "attempts_assignment_id_idx" ON "attempts"("assignment_id");

-- CreateIndex
CREATE INDEX "attempts_learner_id_idx" ON "attempts"("learner_id");

-- CreateIndex
CREATE UNIQUE INDEX "attempts_assignment_id_learner_id_key" ON "attempts"("assignment_id", "learner_id");

-- CreateIndex
CREATE INDEX "attempt_responses_tenant_id_idx" ON "attempt_responses"("tenant_id");

-- CreateIndex
CREATE INDEX "attempt_responses_attempt_id_idx" ON "attempt_responses"("attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_responses_attempt_id_activity_question_id_key" ON "attempt_responses"("attempt_id", "activity_question_id");

-- CreateIndex
CREATE INDEX "roster_entries_user_id_idx" ON "roster_entries"("user_id");

-- AddForeignKey
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_responses" ADD CONSTRAINT "attempt_responses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_responses" ADD CONSTRAINT "attempt_responses_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_responses" ADD CONSTRAINT "attempt_responses_activity_question_id_fkey" FOREIGN KEY ("activity_question_id") REFERENCES "activity_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
