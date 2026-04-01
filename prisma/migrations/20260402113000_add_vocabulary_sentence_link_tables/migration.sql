-- Normalize vocabulary sentence storage:
-- 1) sentence entity table
-- 2) vocabulary <-> sentence link table with per-sentence tags

CREATE TABLE "VocabularySentence" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "text" TEXT NOT NULL,
  "normalizedText" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "VocabularySentence_normalizedText_sourceUrl_key"
ON "VocabularySentence"("normalizedText", "sourceUrl");

CREATE TABLE "VocabularySentenceLink" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "vocabularyId" TEXT NOT NULL,
  "sentenceId" TEXT NOT NULL,
  "meaningIndex" INTEGER,
  "posTags" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VocabularySentenceLink_vocabularyId_fkey"
    FOREIGN KEY ("vocabularyId") REFERENCES "Vocabulary" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VocabularySentenceLink_sentenceId_fkey"
    FOREIGN KEY ("sentenceId") REFERENCES "VocabularySentence" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "VocabularySentenceLink_vocabularyId_sentenceId_key"
ON "VocabularySentenceLink"("vocabularyId", "sentenceId");

