-- Indexes for the primary material and practice access paths.
CREATE INDEX "materials_type_created_at_idx" ON "public"."materials"("type", "created_at");
CREATE INDEX "questions_material_id_sort_order_idx" ON "public"."questions"("material_id", "sort_order");
CREATE INDEX "QuestionAttempt_questionId_createdAt_idx" ON "public"."QuestionAttempt"("questionId", "createdAt");
CREATE INDEX "collection_materials_material_id_idx" ON "public"."collection_materials"("material_id");

-- Review queues are ordered by due time and filtered by source.
CREATE INDEX "SentenceReview_due_idx" ON "public"."SentenceReview"("due");
CREATE INDEX "SentenceReview_sourceType_sourceId_idx" ON "public"."SentenceReview"("sourceType", "sourceId");
CREATE INDEX "Vocabulary_sourceType_sourceId_idx" ON "public"."Vocabulary"("sourceType", "sourceId");

-- These indexes already belong to the current Prisma model but were missing
-- from the database that the baseline was generated from.
CREATE INDEX "Vocabulary_word_idx" ON "public"."Vocabulary"("word");
CREATE INDEX "Vocabulary_createdAt_idx" ON "public"."Vocabulary"("createdAt");
