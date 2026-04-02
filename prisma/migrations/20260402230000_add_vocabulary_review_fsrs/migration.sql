-- Add FSRS scheduling table for vocabulary flashcard memory mode
CREATE TABLE "VocabularyReview" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "vocabularyId" TEXT NOT NULL,
  "due" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "state" INTEGER NOT NULL DEFAULT 0,
  "stability" REAL NOT NULL DEFAULT 0,
  "difficulty" REAL NOT NULL DEFAULT 0,
  "elapsed_days" INTEGER NOT NULL DEFAULT 0,
  "scheduled_days" INTEGER NOT NULL DEFAULT 0,
  "reps" INTEGER NOT NULL DEFAULT 0,
  "lapses" INTEGER NOT NULL DEFAULT 0,
  "learning_steps" INTEGER NOT NULL DEFAULT 0,
  "last_review" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VocabularyReview_vocabularyId_fkey"
    FOREIGN KEY ("vocabularyId") REFERENCES "Vocabulary"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "VocabularyReview_vocabularyId_key"
ON "VocabularyReview"("vocabularyId");

CREATE INDEX "VocabularyReview_due_idx"
ON "VocabularyReview"("due");
