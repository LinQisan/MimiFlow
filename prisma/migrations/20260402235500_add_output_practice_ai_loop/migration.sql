CREATE TABLE IF NOT EXISTS "OutputPractice" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "profileId" TEXT NOT NULL,
  "dateKey" TEXT NOT NULL,
  "practiceType" TEXT NOT NULL DEFAULT 'WRITING',
  "languageCode" TEXT NOT NULL DEFAULT 'ja',
  "missionPrompt" TEXT NOT NULL,
  "missionText" TEXT NOT NULL,
  "learnerText" TEXT NOT NULL,
  "aiCoachPrompt" TEXT NOT NULL,
  "aiFeedbackRaw" TEXT NOT NULL,
  "totalScore" INTEGER NOT NULL DEFAULT 0,
  "comprehensibility" INTEGER NOT NULL DEFAULT 0,
  "accuracy" INTEGER NOT NULL DEFAULT 0,
  "complexity" INTEGER NOT NULL DEFAULT 0,
  "taskCompletion" INTEGER NOT NULL DEFAULT 0,
  "feedbackSummary" TEXT,
  "actionItems" TEXT,
  "wordCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutputPractice_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "GameProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "OutputPractice_profileId_dateKey_practiceType_key"
ON "OutputPractice"("profileId", "dateKey", "practiceType");

CREATE INDEX IF NOT EXISTS "OutputPractice_dateKey_idx"
ON "OutputPractice"("dateKey");
