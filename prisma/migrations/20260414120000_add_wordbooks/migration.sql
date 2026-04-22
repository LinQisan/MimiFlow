-- CreateTable
CREATE TABLE "wordbooks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "wordbooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wordbook_vocabularies" (
    "id" TEXT NOT NULL,
    "wordbook_id" TEXT NOT NULL,
    "vocabulary_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wordbook_vocabularies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wordbooks_parentId_title_key" ON "wordbooks"("parentId", "title");

-- CreateIndex
CREATE INDEX "wordbooks_parentId_idx" ON "wordbooks"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "wordbook_vocabularies_wordbook_id_vocabulary_id_key" ON "wordbook_vocabularies"("wordbook_id", "vocabulary_id");

-- CreateIndex
CREATE INDEX "wordbook_vocabularies_wordbook_id_idx" ON "wordbook_vocabularies"("wordbook_id");

-- CreateIndex
CREATE INDEX "wordbook_vocabularies_vocabulary_id_idx" ON "wordbook_vocabularies"("vocabulary_id");

-- AddForeignKey
ALTER TABLE "wordbooks" ADD CONSTRAINT "wordbooks_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "wordbooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wordbook_vocabularies" ADD CONSTRAINT "wordbook_vocabularies_wordbook_id_fkey" FOREIGN KEY ("wordbook_id") REFERENCES "wordbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wordbook_vocabularies" ADD CONSTRAINT "wordbook_vocabularies_vocabulary_id_fkey" FOREIGN KEY ("vocabulary_id") REFERENCES "Vocabulary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration: folders -> wordbooks (idempotent)
INSERT INTO "wordbooks" ("id", "title", "parentId", "sortOrder", "createdAt", "updatedAt")
SELECT
  vf."id",
  vf."name",
  vf."parentId",
  0,
  vf."createdAt",
  CURRENT_TIMESTAMP
FROM "VocabularyFolder" vf
ON CONFLICT ("id") DO NOTHING;

-- Data migration: vocabulary.folderId -> wordbook_vocabularies (idempotent)
INSERT INTO "wordbook_vocabularies" ("id", "wordbook_id", "vocabulary_id", "sort_order", "created_at")
SELECT
  concat('legacy_', md5(v."id" || '_' || v."folderId")),
  v."folderId",
  v."id",
  0,
  CURRENT_TIMESTAMP
FROM "Vocabulary" v
WHERE v."folderId" IS NOT NULL
ON CONFLICT ("wordbook_id", "vocabulary_id") DO NOTHING;
