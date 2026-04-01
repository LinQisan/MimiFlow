-- Add part-of-speech metadata fields for vocabulary
ALTER TABLE "Vocabulary" ADD COLUMN "partOfSpeech" TEXT;
ALTER TABLE "Vocabulary" ADD COLUMN "partsOfSpeech" TEXT;

