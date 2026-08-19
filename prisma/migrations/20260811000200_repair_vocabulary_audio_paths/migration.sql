UPDATE "public"."Vocabulary"
SET "wordAudio" = regexp_replace(
  "wordAudio",
  '^/audios/imports/anki/',
  '/audios/vocabulary/anki/unlinked/'
)
WHERE "wordAudio" LIKE '/audios/imports/anki/%';
