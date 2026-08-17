-- AlterTable
ALTER TABLE "attempt_responses" ADD COLUMN     "hint_viewed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "concepts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "concepts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_concepts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "concept_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_concepts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mastery_evidence" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "learner_id" TEXT NOT NULL,
    "concept_id" TEXT NOT NULL,
    "attempt_response_id" TEXT NOT NULL,
    "response_score" DOUBLE PRECISION NOT NULL,
    "hint_viewed" BOOLEAN NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mastery_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "concepts_tenant_id_idx" ON "concepts"("tenant_id");

-- CreateIndex
CREATE INDEX "concepts_teacher_id_idx" ON "concepts"("teacher_id");

-- CreateIndex
CREATE INDEX "question_concepts_tenant_id_idx" ON "question_concepts"("tenant_id");

-- CreateIndex
CREATE INDEX "question_concepts_question_id_idx" ON "question_concepts"("question_id");

-- CreateIndex
CREATE INDEX "question_concepts_concept_id_idx" ON "question_concepts"("concept_id");

-- CreateIndex
CREATE UNIQUE INDEX "question_concepts_question_id_concept_id_key" ON "question_concepts"("question_id", "concept_id");

-- CreateIndex
CREATE INDEX "mastery_evidence_tenant_id_idx" ON "mastery_evidence"("tenant_id");

-- CreateIndex
CREATE INDEX "mastery_evidence_learner_id_idx" ON "mastery_evidence"("learner_id");

-- CreateIndex
CREATE INDEX "mastery_evidence_concept_id_idx" ON "mastery_evidence"("concept_id");

-- CreateIndex
CREATE UNIQUE INDEX "mastery_evidence_attempt_response_id_concept_id_key" ON "mastery_evidence"("attempt_response_id", "concept_id");

-- AddForeignKey
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_concepts" ADD CONSTRAINT "question_concepts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_concepts" ADD CONSTRAINT "question_concepts_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_concepts" ADD CONSTRAINT "question_concepts_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_evidence" ADD CONSTRAINT "mastery_evidence_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_evidence" ADD CONSTRAINT "mastery_evidence_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_evidence" ADD CONSTRAINT "mastery_evidence_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastery_evidence" ADD CONSTRAINT "mastery_evidence_attempt_response_id_fkey" FOREIGN KEY ("attempt_response_id") REFERENCES "attempt_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
