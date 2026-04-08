-- Add paper-facing attributes to unified collections table.
ALTER TABLE "collections"
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "language" TEXT,
  ADD COLUMN IF NOT EXISTS "level" TEXT;

-- Backfill level from common JLPT naming, e.g. "2025年7月N1".
UPDATE "collections"
SET "level" = UPPER((regexp_match("title", '(N[1-5])'))[1])
WHERE "level" IS NULL
  AND "title" ~* '(N[1-5])';

-- Backfill language from id prefix when available.
UPDATE "collections"
SET "language" = CASE
  WHEN "id" LIKE 'jp_%' THEN 'ja'
  WHEN "id" LIKE 'en_%' THEN 'en'
  WHEN "id" LIKE 'zh_%' THEN 'zh'
  ELSE "language"
END
WHERE "language" IS NULL
  AND ("id" LIKE 'jp_%' OR "id" LIKE 'en_%' OR "id" LIKE 'zh_%');
