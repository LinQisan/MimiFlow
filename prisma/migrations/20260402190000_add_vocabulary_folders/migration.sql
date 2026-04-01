-- Add vocabulary folder support
CREATE TABLE "VocabularyFolder" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "VocabularyFolder_name_key" ON "VocabularyFolder"("name");

ALTER TABLE "Vocabulary" ADD COLUMN "folderId" TEXT;
CREATE INDEX "Vocabulary_folderId_idx" ON "Vocabulary"("folderId");
