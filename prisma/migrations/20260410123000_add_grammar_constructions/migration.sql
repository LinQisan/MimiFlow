CREATE TABLE IF NOT EXISTS "grammar_constructions" (
  "id" TEXT NOT NULL,
  "grammar_id" TEXT NOT NULL,
  "connection" TEXT NOT NULL,
  "meaning" TEXT NOT NULL,
  "note" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "grammar_constructions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "grammar_constructions_grammar_id_sort_order_idx"
ON "grammar_constructions"("grammar_id","sort_order");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'grammar_constructions_grammar_id_fkey'
  ) THEN
    ALTER TABLE "grammar_constructions"
    ADD CONSTRAINT "grammar_constructions_grammar_id_fkey"
    FOREIGN KEY ("grammar_id") REFERENCES "grammars"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
