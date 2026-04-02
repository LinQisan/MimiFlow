-- Game motivation system: profile + daily task logs
CREATE TABLE IF NOT EXISTS "GameProfile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "xp" INTEGER NOT NULL DEFAULT 0,
  "level" INTEGER NOT NULL DEFAULT 1,
  "coins" INTEGER NOT NULL DEFAULT 0,
  "streakDays" INTEGER NOT NULL DEFAULT 0,
  "lastStreakDate" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "GameSessionLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "profileId" TEXT NOT NULL,
  "dateKey" TEXT NOT NULL,
  "taskKey" TEXT NOT NULL,
  "taskTitle" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "coins" INTEGER NOT NULL DEFAULT 0,
  "durationMin" INTEGER NOT NULL DEFAULT 0,
  "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GameSessionLog_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "GameProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "GameSessionLog_profileId_dateKey_taskKey_key"
ON "GameSessionLog"("profileId", "dateKey", "taskKey");

CREATE INDEX IF NOT EXISTS "GameSessionLog_dateKey_idx"
ON "GameSessionLog"("dateKey");
