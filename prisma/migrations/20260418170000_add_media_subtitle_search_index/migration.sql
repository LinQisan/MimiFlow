CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TABLE IF NOT EXISTS "media_subtitle_lines" (
  "id" TEXT NOT NULL,
  "material_id" TEXT NOT NULL,
  "stable_id" TEXT NOT NULL,
  "sequence_id" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "normalized_text" TEXT NOT NULL,
  "search_text" TEXT NOT NULL,
  "note" TEXT,
  "start" DOUBLE PRECISION NOT NULL,
  "end" DOUBLE PRECISION NOT NULL,
  "material_title" TEXT NOT NULL,
  "work_title" TEXT,
  "season" TEXT,
  "episode" TEXT,
  "subtitle_source_type" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "media_subtitle_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "media_subtitle_lines_material_id_stable_id_key"
ON "media_subtitle_lines"("material_id", "stable_id");

CREATE INDEX IF NOT EXISTS "media_subtitle_lines_material_id_sequence_id_idx"
ON "media_subtitle_lines"("material_id", "sequence_id");

CREATE INDEX IF NOT EXISTS "media_subtitle_lines_subtitle_source_type_work_title_idx"
ON "media_subtitle_lines"("subtitle_source_type", "work_title");

CREATE INDEX IF NOT EXISTS "media_subtitle_lines_search_text_trgm_idx"
ON "media_subtitle_lines"
USING GIN ("search_text" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "media_subtitle_lines_normalized_text_trgm_idx"
ON "media_subtitle_lines"
USING GIN ("normalized_text" gin_trgm_ops);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'media_subtitle_lines_material_id_fkey'
  ) THEN
    ALTER TABLE "media_subtitle_lines"
    ADD CONSTRAINT "media_subtitle_lines_material_id_fkey"
    FOREIGN KEY ("material_id") REFERENCES "materials"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
