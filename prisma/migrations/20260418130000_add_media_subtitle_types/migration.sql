ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'MEDIA_SUBTITLE_LINE';
ALTER TYPE "MaterialType" ADD VALUE IF NOT EXISTS 'MEDIA_SUBTITLE';

UPDATE "materials"
SET "type" = 'MEDIA_SUBTITLE'
WHERE "type" IN ('LISTENING', 'SPEAKING')
  AND (
    COALESCE("content_payload"->>'subtitleSourceType', '') IN ('TV', 'MOVIE')
    OR COALESCE("content_payload"->>'subtitleWorkTitle', '') <> ''
    OR COALESCE("content_payload"->>'subtitleNoAudio', '') = 'true'
  );
