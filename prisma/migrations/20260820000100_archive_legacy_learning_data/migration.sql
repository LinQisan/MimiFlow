-- Preserve data from product areas that are no longer part of the active
-- Prisma schema, migrate legacy vocabulary groups to wordbooks, and retire
-- the corresponding public-schema structures.
--
-- The whole migration is transactional: validation failures roll everything
-- back instead of leaving a partially archived database.
BEGIN;

CREATE SCHEMA IF NOT EXISTS "archive";

-- Keep the removed pre-consolidation migration audit trail outside Prisma's
-- active migration table. These rows refer to migration files superseded by
-- 20260809000000_baseline and must not participate in future deploys.
CREATE TABLE IF NOT EXISTS "archive"."prisma_migrations_legacy"
  (LIKE "public"."_prisma_migrations" INCLUDING ALL);

INSERT INTO "archive"."prisma_migrations_legacy"
SELECT legacy.*
FROM "public"."_prisma_migrations" AS legacy
WHERE legacy."migration_name" IN (
  '20260403020000_postgresql_baseline',
  '20260403033000_unify_paper_passage_question_ownership',
  '20260408093000_material_collection_refactor',
  '20260408113000_add_material_study_progress',
  '20260408153000_drop_legacy_exam_tables',
  '20260408190000_collection_tree_and_progress_mode',
  '20260408193000_add_question_note',
  '20260408193000_collection_paper_attributes',
  '20260409110000_add_material_playtime_stats',
  '20260409133000_add_material_chapter_name',
  '20260410110000_add_grammar_models',
  '20260410123000_add_grammar_constructions',
  '20260410133000_construction_examples_and_drop_pattern'
)
ON CONFLICT ("id") DO NOTHING;

DELETE FROM "public"."_prisma_migrations"
WHERE "migration_name" IN (
  '20260403020000_postgresql_baseline',
  '20260403033000_unify_paper_passage_question_ownership',
  '20260408093000_material_collection_refactor',
  '20260408113000_add_material_study_progress',
  '20260408153000_drop_legacy_exam_tables',
  '20260408190000_collection_tree_and_progress_mode',
  '20260408193000_add_question_note',
  '20260408193000_collection_paper_attributes',
  '20260409110000_add_material_playtime_stats',
  '20260409133000_add_material_chapter_name',
  '20260410110000_add_grammar_models',
  '20260410123000_add_grammar_constructions',
  '20260410133000_construction_examples_and_drop_pattern'
);

CREATE TABLE IF NOT EXISTS "archive"."game_profile_legacy" (
  "profile_id" TEXT PRIMARY KEY,
  "xp" INTEGER NOT NULL,
  "level" INTEGER NOT NULL,
  "difficulty_preset" TEXT NOT NULL,
  "coins" INTEGER NOT NULL,
  "streak_days" INTEGER NOT NULL,
  "last_streak_date" TEXT,
  "archived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "archive"."game_profile_legacy" (
  "profile_id",
  "xp",
  "level",
  "difficulty_preset",
  "coins",
  "streak_days",
  "last_streak_date"
)
SELECT
  "id",
  "xp",
  "level",
  "difficultyPreset"::TEXT,
  "coins",
  "streakDays",
  "lastStreakDate"
FROM "public"."GameProfile"
ON CONFLICT ("profile_id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "archive"."vocabulary_legacy_classification" (
  "vocabulary_id" TEXT PRIMARY KEY,
  "group_name" TEXT,
  "folder_id" TEXT,
  "archived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "archive"."vocabulary_legacy_classification" (
  "vocabulary_id",
  "group_name",
  "folder_id"
)
SELECT "id", "groupName", "folderId"
FROM "public"."Vocabulary"
WHERE "groupName" IS NOT NULL OR "folderId" IS NOT NULL
ON CONFLICT ("vocabulary_id") DO NOTHING;

-- Represent every legacy group explicitly in the current wordbook model.
INSERT INTO "public"."wordbooks" (
  "id",
  "title",
  "parentId",
  "sortOrder",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy-vocabulary-groups',
  '旧词汇分组',
  NULL,
  COALESCE(MAX("sortOrder"), -1) + 1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "public"."wordbooks"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "public"."wordbooks" (
  "id",
  "title",
  "parentId",
  "sortOrder",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy-group-' || MD5(TRIM(groups."groupName")),
  TRIM(groups."groupName"),
  'legacy-vocabulary-groups',
  ROW_NUMBER() OVER (ORDER BY TRIM(groups."groupName")) - 1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "groupName"
  FROM "public"."Vocabulary"
  WHERE "groupName" IS NOT NULL AND TRIM("groupName") <> ''
) AS groups
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "public"."wordbook_vocabularies" (
  "id",
  "wordbook_id",
  "vocabulary_id",
  "sort_order",
  "created_at"
)
SELECT
  'legacy-link-' || MD5(vocabulary."id" || CHR(31) || TRIM(vocabulary."groupName")),
  'legacy-group-' || MD5(TRIM(vocabulary."groupName")),
  vocabulary."id",
  ROW_NUMBER() OVER (
    PARTITION BY TRIM(vocabulary."groupName")
    ORDER BY vocabulary."createdAt", vocabulary."id"
  ) - 1,
  vocabulary."createdAt"
FROM "public"."Vocabulary" AS vocabulary
WHERE vocabulary."groupName" IS NOT NULL
  AND TRIM(vocabulary."groupName") <> ''
ON CONFLICT ("wordbook_id", "vocabulary_id") DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "public"."Vocabulary" AS vocabulary
    WHERE vocabulary."groupName" IS NOT NULL
      AND TRIM(vocabulary."groupName") <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM "public"."wordbook_vocabularies" AS entry
        WHERE entry."vocabulary_id" = vocabulary."id"
          AND entry."wordbook_id" =
            'legacy-group-' || MD5(TRIM(vocabulary."groupName"))
      )
  ) THEN
    RAISE EXCEPTION 'Legacy vocabulary group migration is incomplete';
  END IF;
END $$;

-- Detach archived product tables from active models, then move them intact.
ALTER TABLE "public"."GameSessionLog"
  DROP CONSTRAINT IF EXISTS "GameSessionLog_profileId_fkey";
ALTER TABLE "public"."OutputPractice"
  DROP CONSTRAINT IF EXISTS "OutputPractice_profileId_fkey";
ALTER TABLE "public"."Vocabulary"
  DROP CONSTRAINT IF EXISTS "Vocabulary_folderId_fkey";

ALTER TABLE "public"."GameSessionLog" SET SCHEMA "archive";
ALTER TABLE "public"."LearningDiary" SET SCHEMA "archive";
ALTER TABLE "public"."MorningRecall" SET SCHEMA "archive";
ALTER TABLE "public"."OutputPractice" SET SCHEMA "archive";
ALTER TABLE "public"."VocabularyFolder" SET SCHEMA "archive";

ALTER TABLE "public"."GameProfile"
  DROP COLUMN "xp",
  DROP COLUMN "level",
  DROP COLUMN "difficultyPreset",
  DROP COLUMN "coins",
  DROP COLUMN "streakDays",
  DROP COLUMN "lastStreakDate";

ALTER TABLE "public"."Vocabulary"
  DROP COLUMN "groupName",
  DROP COLUMN "folderId";

ALTER TYPE "public"."GameDifficultyPreset" SET SCHEMA "archive";
ALTER TYPE "public"."OutputPracticeType" SET SCHEMA "archive";

COMMENT ON SCHEMA "archive" IS
  'Read-only legacy data retained during the 2026-08-20 schema consolidation.';

COMMIT;
