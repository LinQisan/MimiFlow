-- Dialogue-backed records use one scoped source identity: material UUID + line key.
ALTER TABLE "Vocabulary"
  ADD CONSTRAINT "vocabulary_dialogue_source_id_check"
  CHECK (
    "sourceType" NOT IN ('AUDIO_DIALOGUE', 'MEDIA_SUBTITLE_LINE')
    OR "sourceId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}::.+$'
  ) NOT VALID;

ALTER TABLE "Vocabulary"
  VALIDATE CONSTRAINT "vocabulary_dialogue_source_id_check";

ALTER TABLE "VocabularySentence"
  ADD CONSTRAINT "vocabulary_sentence_dialogue_source_id_check"
  CHECK (
    "sourceType" IS NULL
    OR "sourceType" NOT IN ('AUDIO_DIALOGUE', 'MEDIA_SUBTITLE_LINE')
    OR "sourceId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}::.+$'
  ) NOT VALID;

ALTER TABLE "VocabularySentence"
  VALIDATE CONSTRAINT "vocabulary_sentence_dialogue_source_id_check";

ALTER TABLE "SentenceReview"
  ADD CONSTRAINT "sentence_review_dialogue_source_id_check"
  CHECK (
    "sourceType" NOT IN ('AUDIO_DIALOGUE', 'MEDIA_SUBTITLE_LINE')
    OR "sourceId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}::.+$'
  ) NOT VALID;

ALTER TABLE "SentenceReview"
  VALIDATE CONSTRAINT "sentence_review_dialogue_source_id_check";
