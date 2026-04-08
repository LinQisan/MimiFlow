-- Cleanup legacy exam schema after material/question/collection migration.
-- This is destructive: it drops old tables that were previously backfilled
-- into the new unified schema.

DO $$
BEGIN
  -- Remove dependent foreign keys first when they still exist.
  IF to_regclass('"QuestionAttempt"') IS NOT NULL THEN
    ALTER TABLE "QuestionAttempt"
    DROP CONSTRAINT IF EXISTS "QuestionAttempt_questionId_fkey";
  END IF;

  IF to_regclass('"QuestionRetry"') IS NOT NULL THEN
    ALTER TABLE "QuestionRetry"
    DROP CONSTRAINT IF EXISTS "QuestionRetry_questionId_fkey";
  END IF;
END
$$;

DROP TABLE IF EXISTS "QuestionOption" CASCADE;
DROP TABLE IF EXISTS "Dialogue" CASCADE;
DROP TABLE IF EXISTS "Question" CASCADE;
DROP TABLE IF EXISTS "Lesson" CASCADE;
DROP TABLE IF EXISTS "Passage" CASCADE;
DROP TABLE IF EXISTS "Quiz" CASCADE;
DROP TABLE IF EXISTS "Paper" CASCADE;
DROP TABLE IF EXISTS "Level" CASCADE;
