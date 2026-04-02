CREATE TABLE "FSRSProfile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "profileId" TEXT NOT NULL,
  "requestRetention" REAL NOT NULL DEFAULT 0.9,
  "maximumInterval" INTEGER NOT NULL DEFAULT 36500,
  "weights" TEXT NOT NULL,
  "sampleSize" INTEGER NOT NULL DEFAULT 0,
  "fitVersion" INTEGER NOT NULL DEFAULT 1,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "lastFittedAt" DATETIME,
  "lastEventAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "FSRSProfile_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "GameProfile" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FSRSProfile_profileId_key" ON "FSRSProfile"("profileId");

CREATE TABLE "ReviewEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "profileId" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "deltaDays" INTEGER NOT NULL,
  "scheduledDays" INTEGER NOT NULL,
  "stateBefore" INTEGER NOT NULL,
  "stateAfter" INTEGER NOT NULL,
  "stabilityBefore" REAL NOT NULL,
  "stabilityAfter" REAL NOT NULL,
  "difficultyBefore" REAL NOT NULL,
  "difficultyAfter" REAL NOT NULL,
  "dueAt" DATETIME NOT NULL,
  "reviewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "wasOverdue" BOOLEAN NOT NULL,
  "wasRecallSuccess" BOOLEAN NOT NULL,
  CONSTRAINT "ReviewEvent_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "GameProfile" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ReviewEvent_profileId_reviewedAt_idx" ON "ReviewEvent"("profileId", "reviewedAt");
CREATE INDEX "ReviewEvent_reviewId_reviewedAt_idx" ON "ReviewEvent"("reviewId", "reviewedAt");
