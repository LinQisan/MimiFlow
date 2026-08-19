DO $$
DECLARE
  source_count INTEGER;
  complete_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO source_count
  FROM "public"."questions"
  WHERE "question_type" = 'SORTING'
    AND COALESCE("context", '') <> '';

  WITH ranked AS (
    SELECT
      q."id",
      POSITION(option.value->>'text' IN q."context") AS position
    FROM "public"."questions" q
    CROSS JOIN LATERAL jsonb_array_elements(q."options") option(value)
    WHERE q."question_type" = 'SORTING'
      AND COALESCE(q."context", '') <> ''
  ), complete AS (
    SELECT "id"
    FROM ranked
    GROUP BY "id"
    HAVING BOOL_AND(position > 0)
  )
  SELECT COUNT(*) INTO complete_count FROM complete;

  IF source_count <> 4 OR complete_count <> source_count THEN
    RAISE EXCEPTION
      'Expected 4 recoverable sorting contexts, found % sources and % complete',
      source_count,
      complete_count;
  END IF;
END $$;

WITH ranked AS (
  SELECT
    q."id",
    option.ordinality - 1 AS option_index,
    POSITION(option.value->>'text' IN q."context") AS position
  FROM "public"."questions" q
  CROSS JOIN LATERAL jsonb_array_elements(q."options")
    WITH ORDINALITY option(value, ordinality)
  WHERE q."question_type" = 'SORTING'
    AND COALESCE(q."context", '') <> ''
), resolved AS (
  SELECT
    "id",
    jsonb_agg(option_index ORDER BY position) AS sorting_order
  FROM ranked
  GROUP BY "id"
  HAVING BOOL_AND(position > 0)
)
UPDATE "public"."questions" q
SET "content" = COALESCE(q."content", '{}'::jsonb) ||
      jsonb_build_object('sortingOrder', resolved.sorting_order),
    "context" = NULL,
    "updated_at" = CURRENT_TIMESTAMP
FROM resolved
WHERE q."id" = resolved."id";
