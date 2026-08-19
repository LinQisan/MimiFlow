WITH paper_question_counts AS (
    SELECT
        collection."id" AS collection_id,
        COUNT(DISTINCT question."id")::INTEGER AS question_count
    FROM "collections" collection
    JOIN "collection_materials" collection_material
      ON collection_material."collection_id" = collection."id"
    JOIN "questions" question
      ON question."material_id" = collection_material."material_id"
    WHERE collection."collection_type" = 'PAPER'
    GROUP BY collection."id"
), grouped_attempts AS (
    SELECT
        collection."id" AS collection_id,
        attempt."createdAt" AS completed_at,
        COUNT(DISTINCT attempt."questionId")::INTEGER AS question_count,
        COUNT(*) FILTER (WHERE attempt."isCorrect")::INTEGER AS correct_count
    FROM "collections" collection
    JOIN "collection_materials" collection_material
      ON collection_material."collection_id" = collection."id"
    JOIN "questions" question
      ON question."material_id" = collection_material."material_id"
    JOIN "QuestionAttempt" attempt
      ON attempt."questionId" = question."id"
    WHERE collection."collection_type" = 'PAPER'
    GROUP BY collection."id", attempt."createdAt"
)
INSERT INTO "practice_paper_submissions" (
    "id",
    "collection_id",
    "question_count",
    "correct_count",
    "completed_at"
)
SELECT
    gen_random_uuid()::TEXT,
    grouped_attempts.collection_id,
    grouped_attempts.question_count,
    grouped_attempts.correct_count,
    grouped_attempts.completed_at
FROM grouped_attempts
JOIN paper_question_counts
  ON paper_question_counts.collection_id = grouped_attempts.collection_id
 AND paper_question_counts.question_count = grouped_attempts.question_count;
