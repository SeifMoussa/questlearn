-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('draft', 'published');

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ActivityStatus" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_questions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "activity_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "pinned_version_id" TEXT,
    "order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activities_tenant_id_idx" ON "activities"("tenant_id");

-- CreateIndex
CREATE INDEX "activities_teacher_id_idx" ON "activities"("teacher_id");

-- CreateIndex
CREATE INDEX "activity_questions_activity_id_idx" ON "activity_questions"("activity_id");

-- CreateIndex
CREATE INDEX "activity_questions_tenant_id_idx" ON "activity_questions"("tenant_id");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_questions" ADD CONSTRAINT "activity_questions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_questions" ADD CONSTRAINT "activity_questions_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_questions" ADD CONSTRAINT "activity_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_questions" ADD CONSTRAINT "activity_questions_pinned_version_id_fkey" FOREIGN KEY ("pinned_version_id") REFERENCES "question_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
