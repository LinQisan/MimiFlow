-- AlterTable
ALTER TABLE "VocabularySentence" ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "source_metadata" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "VocabularySentence_provider_external_id_key" ON "VocabularySentence"("provider", "external_id");
