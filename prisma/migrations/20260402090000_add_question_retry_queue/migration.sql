-- Add spaced retry queue for wrong quiz questions (24h/72h/7d)
CREATE TABLE "QuestionRetry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "questionId" TEXT NOT NULL,
  "stage" INTEGER NOT NULL DEFAULT 0,
  "dueAt" DATETIME NOT NULL,
  "wrongCount" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "QuestionRetry_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "QuestionRetry_questionId_key" ON "QuestionRetry"("questionId");
CREATE INDEX "QuestionRetry_dueAt_idx" ON "QuestionRetry"("dueAt");
