ALTER TYPE "public"."QuestionType" ADD VALUE IF NOT EXISTS 'GRAMMAR_SELECTION';

DO $$
DECLARE
  matching_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO matching_count
  FROM "public"."questions" q
  JOIN "public"."materials" m ON m."id" = q."material_id"
  WHERE m."title" = '2025年12月N1'
    AND q."sort_order" BETWEEN 26 AND 35
    AND q."question_type" = 'GRAMMAR';

  IF matching_count <> 10 THEN
    RAISE EXCEPTION
      'Expected 10 grammar questions at 2025年12月N1 #26-35, found %',
      matching_count;
  END IF;
END $$;

UPDATE "public"."questions" q
SET "question_type" = 'GRAMMAR_SELECTION',
    "updated_at" = CURRENT_TIMESTAMP
FROM "public"."materials" m
WHERE m."id" = q."material_id"
  AND m."title" = '2025年12月N1'
  AND q."sort_order" BETWEEN 26 AND 35
  AND q."question_type" = 'GRAMMAR';
