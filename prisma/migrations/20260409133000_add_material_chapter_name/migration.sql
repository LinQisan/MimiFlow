ALTER TABLE "materials"
ADD COLUMN "chapter_name" TEXT;

UPDATE "materials"
SET "chapter_name" = NULLIF(BTRIM("title"), '')
WHERE "type" = 'SPEAKING'
  AND ("chapter_name" IS NULL OR BTRIM("chapter_name") = '');
