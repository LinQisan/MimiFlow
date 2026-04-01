PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Vocabulary" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "word" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "groupName" TEXT,
  "pronunciations" TEXT,
  "partsOfSpeech" TEXT,
  "meanings" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "new_Vocabulary" (
  "id",
  "word",
  "sourceType",
  "sourceId",
  "groupName",
  "pronunciations",
  "partsOfSpeech",
  "meanings",
  "createdAt"
)
SELECT
  "id",
  "word",
  "sourceType",
  "sourceId",
  "groupName",
  CASE
    WHEN "pronunciations" IS NOT NULL AND TRIM("pronunciations") <> '' THEN "pronunciations"
    WHEN "pronunciation" IS NOT NULL AND TRIM("pronunciation") <> '' THEN
      '["' || REPLACE(REPLACE(TRIM("pronunciation"), '\', '\\'), '"', '\"') || '"]'
    ELSE NULL
  END AS "pronunciations",
  CASE
    WHEN "partsOfSpeech" IS NOT NULL AND TRIM("partsOfSpeech") <> '' THEN "partsOfSpeech"
    WHEN "partOfSpeech" IS NOT NULL AND TRIM("partOfSpeech") <> '' THEN
      '["' || REPLACE(REPLACE(TRIM("partOfSpeech"), '\', '\\'), '"', '\"') || '"]'
    ELSE NULL
  END AS "partsOfSpeech",
  "meanings",
  "createdAt"
FROM "Vocabulary";

DROP TABLE "Vocabulary";
ALTER TABLE "new_Vocabulary" RENAME TO "Vocabulary";

PRAGMA foreign_keys=ON;
