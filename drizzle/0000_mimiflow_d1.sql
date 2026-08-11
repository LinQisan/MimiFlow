-- CreateTable
CREATE TABLE "materials" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "chapter_name" TEXT,
    "content_payload" JSONB NOT NULL,
    "metadata" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "media_subtitle_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "material_id" TEXT NOT NULL,
    "stable_id" TEXT NOT NULL,
    "sequence_id" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "normalized_text" TEXT NOT NULL,
    "search_text" TEXT NOT NULL,
    "note" TEXT,
    "start" REAL NOT NULL,
    "end" REAL NOT NULL,
    "material_title" TEXT NOT NULL,
    "work_title" TEXT,
    "season" TEXT,
    "episode" TEXT,
    "subtitle_source_type" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "media_subtitle_lines_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Vocabulary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "word" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "wordAudio" TEXT,
    "pronunciations" TEXT,
    "partsOfSpeech" TEXT,
    "meanings" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "VocabularyTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "VocabularyTagOnVocabulary" (
    "vocabularyId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("vocabularyId", "tagId"),
    CONSTRAINT "VocabularyTagOnVocabulary_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "Vocabulary" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VocabularyTagOnVocabulary_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "VocabularyTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VocabularyReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vocabularyId" TEXT NOT NULL,
    "due" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "state" INTEGER NOT NULL DEFAULT 0,
    "stability" REAL NOT NULL DEFAULT 0,
    "difficulty" REAL NOT NULL DEFAULT 0,
    "elapsed_days" INTEGER NOT NULL DEFAULT 0,
    "scheduled_days" INTEGER NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "learning_steps" INTEGER NOT NULL DEFAULT 0,
    "last_review" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VocabularyReview_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "Vocabulary" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "wordbooks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "wordbooks_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "wordbooks" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "wordbook_vocabularies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wordbook_id" TEXT NOT NULL,
    "vocabulary_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wordbook_vocabularies_wordbook_id_fkey" FOREIGN KEY ("wordbook_id") REFERENCES "wordbooks" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "wordbook_vocabularies_vocabulary_id_fkey" FOREIGN KEY ("vocabulary_id") REFERENCES "Vocabulary" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VocabularySentence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "translation" TEXT,
    "audioFile" TEXT,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "grammars" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "meaning" TEXT,
    "usage_note" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "grammar_constructions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "grammar_id" TEXT NOT NULL,
    "connection" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "grammar_constructions_grammar_id_fkey" FOREIGN KEY ("grammar_id") REFERENCES "grammars" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "grammar_tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "grammar_tag_on_grammar" (
    "grammarId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("grammarId", "tagId"),
    CONSTRAINT "grammar_tag_on_grammar_grammarId_fkey" FOREIGN KEY ("grammarId") REFERENCES "grammars" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "grammar_tag_on_grammar_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "grammar_tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "grammar_clusters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "grammar_cluster_members" (
    "clusterId" TEXT NOT NULL,
    "grammarId" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("clusterId", "grammarId"),
    CONSTRAINT "grammar_cluster_members_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "grammar_clusters" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "grammar_cluster_members_grammarId_fkey" FOREIGN KEY ("grammarId") REFERENCES "grammars" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "grammar_examples" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "grammar_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sentence_text" TEXT NOT NULL,
    "translation" TEXT,
    "note" TEXT,
    "sentence_id" TEXT,
    "construction_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "grammar_examples_grammar_id_fkey" FOREIGN KEY ("grammar_id") REFERENCES "grammars" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "grammar_examples_sentence_id_fkey" FOREIGN KEY ("sentence_id") REFERENCES "VocabularySentence" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "grammar_examples_construction_id_fkey" FOREIGN KEY ("construction_id") REFERENCES "grammar_constructions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VocabularySentenceLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vocabularyId" TEXT NOT NULL,
    "sentenceId" TEXT NOT NULL,
    "meaningIndex" INTEGER,
    "posTags" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VocabularySentenceLink_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "Vocabulary" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VocabularySentenceLink_sentenceId_fkey" FOREIGN KEY ("sentenceId") REFERENCES "VocabularySentence" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SentenceReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "due" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "state" INTEGER NOT NULL DEFAULT 0,
    "stability" REAL NOT NULL DEFAULT 0,
    "difficulty" REAL NOT NULL DEFAULT 0,
    "elapsed_days" INTEGER NOT NULL DEFAULT 0,
    "scheduled_days" INTEGER NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "learning_steps" INTEGER NOT NULL DEFAULT 0,
    "last_review" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "material_id" TEXT NOT NULL,
    "template_type" TEXT NOT NULL DEFAULT 'CHOICE_QUIZ',
    "question_type" TEXT NOT NULL DEFAULT 'PRONUNCIATION',
    "content" JSONB NOT NULL,
    "prompt" TEXT,
    "context" TEXT,
    "options" JSONB,
    "answer" JSONB NOT NULL,
    "analysis" TEXT,
    "note" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "questions_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "language" TEXT,
    "level" TEXT,
    "collection_type" TEXT NOT NULL,
    "accepted_material_types" JSONB NOT NULL DEFAULT [],
    "parent_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "collections_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "collections" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "collection_materials" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collection_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "collection_materials_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "collection_materials_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestionAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "timeSpentMs" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestionAttempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestionRetry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 0,
    "dueAt" DATETIME NOT NULL,
    "wrongCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QuestionRetry_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GameProfile" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "material_study_progresses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profile_id" TEXT NOT NULL DEFAULT 'default',
    "material_id" TEXT NOT NULL,
    "learning_mode" TEXT NOT NULL DEFAULT 'default',
    "progress_percent" REAL NOT NULL DEFAULT 0,
    "last_position" TEXT,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "material_study_progresses_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "GameProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "material_study_progresses_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "material_playtime_stats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profile_id" TEXT NOT NULL DEFAULT 'default',
    "material_id" TEXT NOT NULL,
    "total_seconds" INTEGER NOT NULL DEFAULT 0,
    "played_days" INTEGER NOT NULL DEFAULT 0,
    "last_played_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "material_playtime_stats_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "GameProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "material_playtime_stats_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FSRSProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "requestRetention" REAL NOT NULL DEFAULT 0.9,
    "maximumInterval" INTEGER NOT NULL DEFAULT 36500,
    "weights" TEXT NOT NULL,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "fitVersion" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastEngineMode" TEXT NOT NULL DEFAULT 'custom',
    "lastFallbackReason" TEXT,
    "lastFallbackAt" DATETIME,
    "lastFittedAt" DATETIME,
    "lastEventAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FSRSProfile_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "GameProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "deltaDays" INTEGER NOT NULL,
    "scheduledDays" INTEGER NOT NULL,
    "stateBefore" INTEGER NOT NULL,
    "stateAfter" INTEGER NOT NULL,
    "stabilityBefore" REAL NOT NULL,
    "stabilityAfter" REAL NOT NULL,
    "difficultyBefore" REAL NOT NULL,
    "difficultyAfter" REAL NOT NULL,
    "dueAt" DATETIME NOT NULL,
    "reviewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wasOverdue" BOOLEAN NOT NULL,
    "wasRecallSuccess" BOOLEAN NOT NULL,
    CONSTRAINT "ReviewEvent_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "GameProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudyTimeDaily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dateKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "materials_type_created_at_idx" ON "materials"("type", "created_at");

-- CreateIndex
CREATE INDEX "media_subtitle_lines_material_id_sequence_id_idx" ON "media_subtitle_lines"("material_id", "sequence_id");

-- CreateIndex
CREATE INDEX "media_subtitle_lines_subtitle_source_type_work_title_idx" ON "media_subtitle_lines"("subtitle_source_type", "work_title");

-- CreateIndex
CREATE UNIQUE INDEX "media_subtitle_lines_material_id_stable_id_key" ON "media_subtitle_lines"("material_id", "stable_id");

-- CreateIndex
CREATE INDEX "Vocabulary_word_idx" ON "Vocabulary"("word");

-- CreateIndex
CREATE INDEX "Vocabulary_createdAt_idx" ON "Vocabulary"("createdAt");

-- CreateIndex
CREATE INDEX "Vocabulary_sourceType_sourceId_idx" ON "Vocabulary"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyTag_name_key" ON "VocabularyTag"("name");

-- CreateIndex
CREATE INDEX "VocabularyTagOnVocabulary_tagId_idx" ON "VocabularyTagOnVocabulary"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyReview_vocabularyId_key" ON "VocabularyReview"("vocabularyId");

-- CreateIndex
CREATE INDEX "VocabularyReview_due_idx" ON "VocabularyReview"("due");

-- CreateIndex
CREATE INDEX "wordbooks_parentId_idx" ON "wordbooks"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "wordbooks_parentId_title_key" ON "wordbooks"("parentId", "title");

-- CreateIndex
CREATE INDEX "wordbook_vocabularies_wordbook_id_idx" ON "wordbook_vocabularies"("wordbook_id");

-- CreateIndex
CREATE INDEX "wordbook_vocabularies_vocabulary_id_idx" ON "wordbook_vocabularies"("vocabulary_id");

-- CreateIndex
CREATE UNIQUE INDEX "wordbook_vocabularies_wordbook_id_vocabulary_id_key" ON "wordbook_vocabularies"("wordbook_id", "vocabulary_id");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularySentence_normalizedText_sourceUrl_key" ON "VocabularySentence"("normalizedText", "sourceUrl");

-- CreateIndex
CREATE INDEX "grammars_name_idx" ON "grammars"("name");

-- CreateIndex
CREATE INDEX "grammar_constructions_grammar_id_sort_order_idx" ON "grammar_constructions"("grammar_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "grammar_tags_name_key" ON "grammar_tags"("name");

-- CreateIndex
CREATE INDEX "grammar_tag_on_grammar_tagId_idx" ON "grammar_tag_on_grammar"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "grammar_clusters_title_key" ON "grammar_clusters"("title");

-- CreateIndex
CREATE INDEX "grammar_cluster_members_grammarId_idx" ON "grammar_cluster_members"("grammarId");

-- CreateIndex
CREATE INDEX "grammar_examples_grammar_id_created_at_idx" ON "grammar_examples"("grammar_id", "created_at");

-- CreateIndex
CREATE INDEX "grammar_examples_sentence_id_idx" ON "grammar_examples"("sentence_id");

-- CreateIndex
CREATE INDEX "grammar_examples_construction_id_idx" ON "grammar_examples"("construction_id");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularySentenceLink_vocabularyId_sentenceId_key" ON "VocabularySentenceLink"("vocabularyId", "sentenceId");

-- CreateIndex
CREATE INDEX "SentenceReview_due_idx" ON "SentenceReview"("due");

-- CreateIndex
CREATE INDEX "SentenceReview_sourceType_sourceId_idx" ON "SentenceReview"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "questions_material_id_sort_order_idx" ON "questions"("material_id", "sort_order");

-- CreateIndex
CREATE INDEX "collections_parent_id_sort_order_idx" ON "collections"("parent_id", "sort_order");

-- CreateIndex
CREATE INDEX "collection_materials_material_id_idx" ON "collection_materials"("material_id");

-- CreateIndex
CREATE UNIQUE INDEX "collection_materials_collection_id_material_id_key" ON "collection_materials"("collection_id", "material_id");

-- CreateIndex
CREATE INDEX "QuestionAttempt_questionId_createdAt_idx" ON "QuestionAttempt"("questionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionRetry_questionId_key" ON "QuestionRetry"("questionId");

-- CreateIndex
CREATE INDEX "QuestionRetry_dueAt_idx" ON "QuestionRetry"("dueAt");

-- CreateIndex
CREATE INDEX "material_study_progresses_updated_at_idx" ON "material_study_progresses"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "material_study_progresses_profile_id_material_id_learning_mode_key" ON "material_study_progresses"("profile_id", "material_id", "learning_mode");

-- CreateIndex
CREATE INDEX "material_playtime_stats_material_id_updated_at_idx" ON "material_playtime_stats"("material_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "material_playtime_stats_profile_id_material_id_key" ON "material_playtime_stats"("profile_id", "material_id");

-- CreateIndex
CREATE UNIQUE INDEX "FSRSProfile_profileId_key" ON "FSRSProfile"("profileId");

-- CreateIndex
CREATE INDEX "ReviewEvent_profileId_reviewedAt_idx" ON "ReviewEvent"("profileId", "reviewedAt");

-- CreateIndex
CREATE INDEX "ReviewEvent_reviewId_reviewedAt_idx" ON "ReviewEvent"("reviewId", "reviewedAt");

-- CreateIndex
CREATE INDEX "StudyTimeDaily_dateKey_idx" ON "StudyTimeDaily"("dateKey");

-- CreateIndex
CREATE UNIQUE INDEX "StudyTimeDaily_dateKey_kind_key" ON "StudyTimeDaily"("dateKey", "kind");

PRAGMA optimize;
