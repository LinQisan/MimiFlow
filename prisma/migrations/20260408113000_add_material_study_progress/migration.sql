CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "material_study_progresses" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "profile_id" TEXT NOT NULL DEFAULT 'default',
  "material_id" TEXT NOT NULL,
  "learning_mode" TEXT,
  "progress_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "last_position" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "material_study_progresses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "material_study_progresses_profile_id_material_id_key"
ON "material_study_progresses"("profile_id", "material_id");

CREATE INDEX IF NOT EXISTS "material_study_progresses_updated_at_idx"
ON "material_study_progresses"("updated_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'material_study_progresses_profile_id_fkey'
  ) THEN
    ALTER TABLE "material_study_progresses"
    ADD CONSTRAINT "material_study_progresses_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "GameProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'material_study_progresses_material_id_fkey'
  ) THEN
    ALTER TABLE "material_study_progresses"
    ADD CONSTRAINT "material_study_progresses_material_id_fkey"
    FOREIGN KEY ("material_id") REFERENCES "materials"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- Backfill progress from historical question attempts when possible.
DO $$
BEGIN
  IF to_regclass('"QuestionAttempt"') IS NOT NULL AND to_regclass('"questions"') IS NOT NULL THEN
    WITH question_attempt_stats AS (
      SELECT
        qa."questionId" AS question_id,
        COUNT(*)::int AS attempt_count,
        MAX(qa."createdAt") AS last_attempt_at
      FROM "QuestionAttempt" qa
      GROUP BY qa."questionId"
    ),
    material_stats AS (
      SELECT
        q."material_id" AS material_id,
        COUNT(*)::int AS total_questions,
        COUNT(*) FILTER (WHERE COALESCE(s.attempt_count, 0) > 0)::int AS attempted_questions,
        MAX(s.last_attempt_at) AS last_attempt_at
      FROM "questions" q
      LEFT JOIN question_attempt_stats s ON s.question_id = q."id"
      GROUP BY q."material_id"
    )
    INSERT INTO "material_study_progresses" (
      "id",
      "profile_id",
      "material_id",
      "learning_mode",
      "progress_percent",
      "last_position",
      "started_at",
      "updated_at"
    )
    SELECT
      gen_random_uuid()::text,
      'default',
      m."id",
      CASE
        WHEN m."type" = 'LISTENING' THEN '听力 / 字幕精读'
        WHEN m."type" = 'READING' THEN '阅读 / 题目练习'
        ELSE '题目 / 专项训练'
      END,
      CASE
        WHEN ms.total_questions <= 0 THEN 0
        ELSE ROUND((ms.attempted_questions::numeric / ms.total_questions::numeric) * 100, 1)::double precision
      END,
      CASE
        WHEN ms.total_questions <= 0 THEN NULL
        ELSE FORMAT('已练习 %s / %s 题', ms.attempted_questions, ms.total_questions)
      END,
      COALESCE(ms.last_attempt_at, CURRENT_TIMESTAMP),
      COALESCE(ms.last_attempt_at, CURRENT_TIMESTAMP)
    FROM material_stats ms
    JOIN "materials" m ON m."id" = ms.material_id
    WHERE ms.last_attempt_at IS NOT NULL
    ON CONFLICT ("profile_id", "material_id")
    DO UPDATE SET
      "learning_mode" = EXCLUDED."learning_mode",
      "progress_percent" = EXCLUDED."progress_percent",
      "last_position" = EXCLUDED."last_position",
      "updated_at" = EXCLUDED."updated_at";
  END IF;
END
$$;
