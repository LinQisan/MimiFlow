-- Add list-based vocabulary metadata fields for multiple pronunciations/meanings
ALTER TABLE "Vocabulary" ADD COLUMN "pronunciations" TEXT;
ALTER TABLE "Vocabulary" ADD COLUMN "meanings" TEXT;
