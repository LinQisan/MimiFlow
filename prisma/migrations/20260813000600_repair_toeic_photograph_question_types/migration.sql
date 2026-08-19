UPDATE "questions" AS q
SET "question_type" = 'TOEIC_PHOTOGRAPH'
FROM "materials" AS m
WHERE q."material_id" = m."id"
  AND m."type" = 'LISTENING'
  AND COALESCE(q."content" ->> 'imageUrl', '') <> ''
  AND q."question_type" <> 'TOEIC_PHOTOGRAPH';
