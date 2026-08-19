UPDATE "questions" AS q
SET "content" = COALESCE(q."content", '{}'::jsonb) || '{"shuffleOptions": false}'::jsonb
FROM "materials" AS m
WHERE q."material_id" = m."id"
  AND m."type" = 'LISTENING'
  AND (
    q."content" ->> 'listeningSectionNumber' = '3'
    OR q."content" ->> 'sectionNumber' = '3'
    OR m."content_payload" ->> 'listeningSectionNumber' = '3'
    OR m."content_payload" ->> 'sectionNumber' = '3'
    OR m."metadata" ->> 'listeningSectionNumber' = '3'
    OR m."metadata" ->> 'sectionNumber' = '3'
    OR COALESCE(m."chapter_name", '') ~ '(問題|问题)[[:space:]]*3([^0-9]|$)'
  );
