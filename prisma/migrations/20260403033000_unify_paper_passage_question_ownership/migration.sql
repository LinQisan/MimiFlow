-- Normalize legacy question ownership rows before adding strict constraint.
-- Rule:
-- 1) If both articleId and quizId are present, keep articleId (reading-owned) and clear quizId.
-- 2) If both are NULL, delete the question as invalid orphan.

UPDATE "Question"
SET "quizId" = NULL
WHERE "articleId" IS NOT NULL AND "quizId" IS NOT NULL;

DELETE FROM "Question"
WHERE "articleId" IS NULL AND "quizId" IS NULL;

-- Enforce: each question must belong to exactly one container.
ALTER TABLE "Question"
DROP CONSTRAINT IF EXISTS "Question_exactly_one_parent_check";

ALTER TABLE "Question"
ADD CONSTRAINT "Question_exactly_one_parent_check"
CHECK (
  (CASE WHEN "quizId" IS NULL THEN 0 ELSE 1 END) +
  (CASE WHEN "articleId" IS NULL THEN 0 ELSE 1 END) = 1
);

-- Query performance for ordered rendering inside paper-owned containers.
CREATE INDEX IF NOT EXISTS "Question_quizId_order_idx"
ON "Question"("quizId", "order");

CREATE INDEX IF NOT EXISTS "Question_articleId_order_idx"
ON "Question"("articleId", "order");
