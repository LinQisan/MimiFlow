DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'GrammarExampleSource'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "GrammarExampleSource" AS ENUM ('MANUAL', 'SENTENCE_DB');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "grammars" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "pattern" TEXT,
  "meaning" TEXT,
  "usage_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "grammars_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "grammar_tags" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "grammar_tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "grammar_tag_on_grammar" (
  "grammarId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "grammar_tag_on_grammar_pkey" PRIMARY KEY ("grammarId","tagId")
);

CREATE TABLE IF NOT EXISTS "grammar_clusters" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "grammar_clusters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "grammar_cluster_members" (
  "clusterId" TEXT NOT NULL,
  "grammarId" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "grammar_cluster_members_pkey" PRIMARY KEY ("clusterId","grammarId")
);

CREATE TABLE IF NOT EXISTS "grammar_examples" (
  "id" TEXT NOT NULL,
  "grammar_id" TEXT NOT NULL,
  "source" "GrammarExampleSource" NOT NULL,
  "sentence_text" TEXT NOT NULL,
  "translation" TEXT,
  "note" TEXT,
  "sentence_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "grammar_examples_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "grammar_tags_name_key" ON "grammar_tags"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "grammar_clusters_title_key" ON "grammar_clusters"("title");
CREATE INDEX IF NOT EXISTS "grammars_name_idx" ON "grammars"("name");
CREATE INDEX IF NOT EXISTS "grammar_tag_on_grammar_tagId_idx" ON "grammar_tag_on_grammar"("tagId");
CREATE INDEX IF NOT EXISTS "grammar_cluster_members_grammarId_idx" ON "grammar_cluster_members"("grammarId");
CREATE INDEX IF NOT EXISTS "grammar_examples_grammar_id_created_at_idx" ON "grammar_examples"("grammar_id", "created_at");
CREATE INDEX IF NOT EXISTS "grammar_examples_sentence_id_idx" ON "grammar_examples"("sentence_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'grammar_tag_on_grammar_grammarId_fkey'
  ) THEN
    ALTER TABLE "grammar_tag_on_grammar"
    ADD CONSTRAINT "grammar_tag_on_grammar_grammarId_fkey"
    FOREIGN KEY ("grammarId") REFERENCES "grammars"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'grammar_tag_on_grammar_tagId_fkey'
  ) THEN
    ALTER TABLE "grammar_tag_on_grammar"
    ADD CONSTRAINT "grammar_tag_on_grammar_tagId_fkey"
    FOREIGN KEY ("tagId") REFERENCES "grammar_tags"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'grammar_cluster_members_clusterId_fkey'
  ) THEN
    ALTER TABLE "grammar_cluster_members"
    ADD CONSTRAINT "grammar_cluster_members_clusterId_fkey"
    FOREIGN KEY ("clusterId") REFERENCES "grammar_clusters"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'grammar_cluster_members_grammarId_fkey'
  ) THEN
    ALTER TABLE "grammar_cluster_members"
    ADD CONSTRAINT "grammar_cluster_members_grammarId_fkey"
    FOREIGN KEY ("grammarId") REFERENCES "grammars"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'grammar_examples_grammar_id_fkey'
  ) THEN
    ALTER TABLE "grammar_examples"
    ADD CONSTRAINT "grammar_examples_grammar_id_fkey"
    FOREIGN KEY ("grammar_id") REFERENCES "grammars"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'grammar_examples_sentence_id_fkey'
  ) THEN
    ALTER TABLE "grammar_examples"
    ADD CONSTRAINT "grammar_examples_sentence_id_fkey"
    FOREIGN KEY ("sentence_id") REFERENCES "VocabularySentence"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
