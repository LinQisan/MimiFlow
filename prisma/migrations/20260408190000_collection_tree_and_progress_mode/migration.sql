-- 1) Expand CollectionType enum
ALTER TYPE "CollectionType" ADD VALUE IF NOT EXISTS 'LIBRARY_ROOT';
ALTER TYPE "CollectionType" ADD VALUE IF NOT EXISTS 'BOOK';
ALTER TYPE "CollectionType" ADD VALUE IF NOT EXISTS 'CHAPTER';

-- 2) Add tree fields on collections
ALTER TABLE "collections"
  ADD COLUMN IF NOT EXISTS "parent_id" TEXT,
  ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'collections_parent_id_fkey'
      AND conrelid = 'collections'::regclass
  ) THEN
    ALTER TABLE "collections"
      ADD CONSTRAINT "collections_parent_id_fkey"
      FOREIGN KEY ("parent_id") REFERENCES "collections"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "collections_parent_id_sort_order_idx"
  ON "collections"("parent_id", "sort_order");

-- 3) Scope study progress uniqueness by learning_mode
UPDATE "material_study_progresses"
SET "learning_mode" = 'default'
WHERE "learning_mode" IS NULL;

ALTER TABLE "material_study_progresses"
  ALTER COLUMN "learning_mode" SET DEFAULT 'default',
  ALTER COLUMN "learning_mode" SET NOT NULL;

DROP INDEX IF EXISTS "material_study_progresses_profile_id_material_id_key";

CREATE UNIQUE INDEX IF NOT EXISTS "material_study_progresses_profile_id_material_id_learning_mode_key"
  ON "material_study_progresses"("profile_id", "material_id", "learning_mode");
