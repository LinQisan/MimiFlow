ALTER TABLE "grammar_examples"
ADD COLUMN IF NOT EXISTS "construction_id" TEXT;

CREATE INDEX IF NOT EXISTS "grammar_examples_construction_id_idx"
ON "grammar_examples"("construction_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'grammar_examples_construction_id_fkey'
  ) THEN
    ALTER TABLE "grammar_examples"
    ADD CONSTRAINT "grammar_examples_construction_id_fkey"
    FOREIGN KEY ("construction_id") REFERENCES "grammar_constructions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

ALTER TABLE "grammars"
DROP COLUMN IF EXISTS "pattern";
