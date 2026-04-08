-- New unified material/question/collection schema.
-- This migration is additive and backfills from legacy exam tables.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MaterialType') THEN
    CREATE TYPE "MaterialType" AS ENUM ('LISTENING', 'READING', 'VOCAB_GRAMMAR');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QuestionTemplate') THEN
    CREATE TYPE "QuestionTemplate" AS ENUM ('CHOICE_QUIZ', 'CLOZE_TEST', 'FILL_BLANK');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CollectionType') THEN
    CREATE TYPE "CollectionType" AS ENUM ('PAPER', 'CUSTOM_GROUP', 'FAVORITES');
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('"QuestionAttempt"') IS NOT NULL AND to_regclass('"questions"') IS NOT NULL THEN
    ALTER TABLE "QuestionAttempt"
    DROP CONSTRAINT IF EXISTS "QuestionAttempt_questionId_fkey";

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'QuestionAttempt_questionId_fkey'
    ) THEN
      ALTER TABLE "QuestionAttempt"
      ADD CONSTRAINT "QuestionAttempt_questionId_fkey"
      FOREIGN KEY ("questionId") REFERENCES "questions"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END IF;

  IF to_regclass('"QuestionRetry"') IS NOT NULL AND to_regclass('"questions"') IS NOT NULL THEN
    ALTER TABLE "QuestionRetry"
    DROP CONSTRAINT IF EXISTS "QuestionRetry_questionId_fkey";

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'QuestionRetry_questionId_fkey'
    ) THEN
      ALTER TABLE "QuestionRetry"
      ADD CONSTRAINT "QuestionRetry_questionId_fkey"
      FOREIGN KEY ("questionId") REFERENCES "questions"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "materials" (
  "id" TEXT NOT NULL,
  "type" "MaterialType" NOT NULL,
  "title" TEXT NOT NULL,
  "content_payload" JSONB NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "questions" (
  "id" TEXT NOT NULL,
  "material_id" TEXT NOT NULL,
  "template_type" "QuestionTemplate" NOT NULL,
  "content" JSONB NOT NULL,
  "prompt" TEXT,
  "context" TEXT,
  "options" JSONB,
  "answer" JSONB NOT NULL,
  "analysis" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "collections" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "collection_type" "CollectionType" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "collection_materials" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "collection_id" TEXT NOT NULL,
  "material_id" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collection_materials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "collection_materials_collection_id_material_id_key"
ON "collection_materials"("collection_id", "material_id");

CREATE INDEX IF NOT EXISTS "questions_material_id_sort_order_idx"
ON "questions"("material_id", "sort_order");

CREATE INDEX IF NOT EXISTS "collection_materials_collection_id_sort_order_idx"
ON "collection_materials"("collection_id", "sort_order");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'questions_material_id_fkey'
  ) THEN
    ALTER TABLE "questions"
    ADD CONSTRAINT "questions_material_id_fkey"
    FOREIGN KEY ("material_id") REFERENCES "materials"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'collection_materials_collection_id_fkey'
  ) THEN
    ALTER TABLE "collection_materials"
    ADD CONSTRAINT "collection_materials_collection_id_fkey"
    FOREIGN KEY ("collection_id") REFERENCES "collections"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'collection_materials_material_id_fkey'
  ) THEN
    ALTER TABLE "collection_materials"
    ADD CONSTRAINT "collection_materials_material_id_fkey"
    FOREIGN KEY ("material_id") REFERENCES "materials"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- Backfill only when legacy tables exist.
DO $$
BEGIN
  IF to_regclass('"Paper"') IS NOT NULL THEN
    INSERT INTO "collections" ("id", "title", "collection_type", "created_at", "updated_at")
    SELECT
      p."id",
      p."name",
      'PAPER'::"CollectionType",
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM "Paper" p
    ON CONFLICT ("id") DO NOTHING;
  END IF;

  IF to_regclass('"Lesson"') IS NOT NULL THEN
    INSERT INTO "materials" ("id", "type", "title", "content_payload", "metadata", "created_at", "updated_at")
    SELECT
      'lesson:' || l."id",
      'LISTENING'::"MaterialType",
      l."title",
      jsonb_build_object(
        'audioUrl', l."audioFile",
        'audioFile', l."audioFile",
        'dialogues', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', d."id",
              'text', d."text",
              'start', d."start",
              'end', d."end",
              'sequenceId', d."sequenceId"
            )
            ORDER BY d."sequenceId" ASC
          )
          FROM "Dialogue" d
          WHERE d."lessonId" = l."id"
        ), '[]'::jsonb)
      ),
      jsonb_build_object(
        'legacy', jsonb_build_object(
          'model', 'Lesson',
          'paperId', l."paperId",
          'sortOrder', l."sortOrder"
        )
      ),
      l."createdAt",
      l."createdAt"
    FROM "Lesson" l
    ON CONFLICT ("id") DO NOTHING;

    INSERT INTO "collection_materials" ("collection_id", "material_id", "sort_order", "created_at")
    SELECT
      l."paperId",
      'lesson:' || l."id",
      l."sortOrder",
      l."createdAt"
    FROM "Lesson" l
    INNER JOIN "collections" c ON c."id" = l."paperId"
    ON CONFLICT ("collection_id", "material_id") DO NOTHING;
  END IF;

  IF to_regclass('"Passage"') IS NOT NULL THEN
    INSERT INTO "materials" ("id", "type", "title", "content_payload", "metadata", "created_at", "updated_at")
    SELECT
      'passage:' || p."id",
      'READING'::"MaterialType",
      p."title",
      jsonb_build_object(
        'text', p."content",
        'description', p."description"
      ),
      jsonb_build_object(
        'legacy', jsonb_build_object(
          'model', 'Passage',
          'paperId', p."paperId",
          'sortOrder', p."sortOrder"
        )
      ),
      p."createdAt",
      p."createdAt"
    FROM "Passage" p
    ON CONFLICT ("id") DO NOTHING;

    INSERT INTO "collection_materials" ("collection_id", "material_id", "sort_order", "created_at")
    SELECT
      p."paperId",
      'passage:' || p."id",
      p."sortOrder",
      p."createdAt"
    FROM "Passage" p
    INNER JOIN "collections" c ON c."id" = p."paperId"
    ON CONFLICT ("collection_id", "material_id") DO NOTHING;
  END IF;

  IF to_regclass('"Quiz"') IS NOT NULL THEN
    INSERT INTO "materials" ("id", "type", "title", "content_payload", "metadata", "created_at", "updated_at")
    SELECT
      'quiz:' || q."id",
      'VOCAB_GRAMMAR'::"MaterialType",
      q."title",
      jsonb_build_object(
        'description', q."description"
      ),
      jsonb_build_object(
        'legacy', jsonb_build_object(
          'model', 'Quiz',
          'paperId', q."paperId",
          'sortOrder', q."sortOrder"
        )
      ),
      q."createdAt",
      q."createdAt"
    FROM "Quiz" q
    ON CONFLICT ("id") DO NOTHING;

    INSERT INTO "collection_materials" ("collection_id", "material_id", "sort_order", "created_at")
    SELECT
      q."paperId",
      'quiz:' || q."id",
      q."sortOrder",
      q."createdAt"
    FROM "Quiz" q
    INNER JOIN "collections" c ON c."id" = q."paperId"
    ON CONFLICT ("collection_id", "material_id") DO NOTHING;
  END IF;

  IF to_regclass('"Question"') IS NOT NULL THEN
    INSERT INTO "questions" (
      "id",
      "material_id",
      "template_type",
      "content",
      "prompt",
      "context",
      "options",
      "answer",
      "analysis",
      "created_at",
      "updated_at",
      "sort_order"
    )
    SELECT
      q."id",
      CASE
        WHEN q."lessonId" IS NOT NULL THEN 'lesson:' || q."lessonId"
        WHEN q."passageId" IS NOT NULL THEN 'passage:' || q."passageId"
        ELSE 'quiz:' || q."quizId"
      END AS material_id,
      CASE
        WHEN q."questionType" = 'FILL_BLANK' THEN 'FILL_BLANK'::"QuestionTemplate"
        ELSE 'CHOICE_QUIZ'::"QuestionTemplate"
      END AS template_type,
      jsonb_build_object(
        'questionType', q."questionType",
        'targetWord', q."targetWord",
        'order', q."order",
        'legacy', jsonb_build_object(
          'quizId', q."quizId",
          'lessonId', q."lessonId",
          'passageId', q."passageId"
        )
      ),
      q."prompt",
      q."contextSentence",
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', o."id",
            'text', o."text"
          )
          ORDER BY o."id" ASC
        )
        FROM "QuestionOption" o
        WHERE o."questionId" = q."id"
      ), '[]'::jsonb),
      (
        SELECT
          CASE
            WHEN COUNT(*) FILTER (WHERE o."isCorrect") <= 1 THEN
              to_jsonb(MAX(o."id") FILTER (WHERE o."isCorrect"))
            ELSE
              to_jsonb(array_agg(o."id" ORDER BY o."id") FILTER (WHERE o."isCorrect"))
          END
        FROM "QuestionOption" o
        WHERE o."questionId" = q."id"
      ),
      q."explanation",
      q."createdAt",
      q."createdAt",
      q."order"
    FROM "Question" q
    WHERE (q."lessonId" IS NOT NULL OR q."passageId" IS NOT NULL OR q."quizId" IS NOT NULL)
    ON CONFLICT ("id") DO NOTHING;
  END IF;
END
$$;
