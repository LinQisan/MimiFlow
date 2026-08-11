-- `prompt` is the learner-facing question. `context` is optional supporting
-- text, so an identical second copy carries no information.
UPDATE "questions"
SET "context" = NULL
WHERE "prompt" IS NOT NULL
  AND "context" IS NOT NULL
  AND btrim(regexp_replace("prompt", '[[:space:]]+', ' ', 'g')) =
      btrim(regexp_replace("context", '[[:space:]]+', ' ', 'g'));
