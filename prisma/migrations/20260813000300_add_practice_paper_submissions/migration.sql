CREATE TABLE "practice_paper_submissions" (
    "id" TEXT NOT NULL,
    "collection_id" TEXT NOT NULL,
    "question_count" INTEGER NOT NULL,
    "correct_count" INTEGER NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_paper_submissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "practice_paper_submissions_collection_id_completed_at_idx"
ON "practice_paper_submissions"("collection_id", "completed_at");

ALTER TABLE "practice_paper_submissions"
ADD CONSTRAINT "practice_paper_submissions_collection_id_fkey"
FOREIGN KEY ("collection_id") REFERENCES "collections"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
