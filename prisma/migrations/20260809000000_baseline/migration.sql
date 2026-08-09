-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- Required by the GIN trigram indexes on media subtitle search fields.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "public"."CollectionType" AS ENUM ('PAPER', 'CUSTOM_GROUP', 'FAVORITES', 'LIBRARY_ROOT', 'BOOK', 'CHAPTER');

-- CreateEnum
CREATE TYPE "public"."GameDifficultyPreset" AS ENUM ('CONSERVATIVE', 'STANDARD', 'AGGRESSIVE');

-- CreateEnum
CREATE TYPE "public"."GrammarExampleSource" AS ENUM ('MANUAL', 'SENTENCE_DB');

-- CreateEnum
CREATE TYPE "public"."MaterialType" AS ENUM ('LISTENING', 'READING', 'VOCAB_GRAMMAR', 'SPEAKING', 'MEDIA_SUBTITLE');

-- CreateEnum
CREATE TYPE "public"."OutputPracticeType" AS ENUM ('WRITING');

-- CreateEnum
CREATE TYPE "public"."QuestionTemplate" AS ENUM ('CHOICE_QUIZ', 'CLOZE_TEST', 'FILL_BLANK');

-- CreateEnum
CREATE TYPE "public"."QuestionType" AS ENUM ('PRONUNCIATION', 'WORD_DISTINCTION', 'FILL_BLANK', 'GRAMMAR', 'TRANSLATION', 'SORTING', 'READING_COMPREHENSION', 'SYNONYM_REPLACEMENT', 'LISTENING');

-- CreateEnum
CREATE TYPE "public"."SourceType" AS ENUM ('AUDIO_DIALOGUE', 'ARTICLE_TEXT', 'QUIZ_QUESTION', 'MEDIA_SUBTITLE_LINE');

-- CreateEnum
CREATE TYPE "public"."StudyTimeKind" AS ENUM ('LESSON_SPEAKING', 'ARTICLE_READING');

-- CreateTable
CREATE TABLE "public"."FSRSProfile" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "requestRetention" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "maximumInterval" INTEGER NOT NULL DEFAULT 36500,
    "weights" TEXT NOT NULL,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "fitVersion" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastEngineMode" TEXT NOT NULL DEFAULT 'custom',
    "lastFallbackReason" TEXT,
    "lastFallbackAt" TIMESTAMP(3),
    "lastFittedAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FSRSProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GameProfile" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "difficultyPreset" "public"."GameDifficultyPreset" NOT NULL DEFAULT 'STANDARD',
    "coins" INTEGER NOT NULL DEFAULT 0,
    "streakDays" INTEGER NOT NULL DEFAULT 0,
    "lastStreakDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GameSessionLog" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "taskKey" TEXT NOT NULL,
    "taskTitle" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "durationMin" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameSessionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LearningDiary" (
    "id" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningDiary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MorningRecall" (
    "id" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "sourceDateKey" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "aiCoachPrompt" TEXT,
    "aiFeedbackRaw" TEXT,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "accuracy" INTEGER NOT NULL DEFAULT 0,
    "coverage" INTEGER NOT NULL DEFAULT 0,
    "clarity" INTEGER NOT NULL DEFAULT 0,
    "feedbackSummary" TEXT,
    "actionItems" TEXT,
    "modelAnswer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MorningRecall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OutputPractice" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "practiceType" "public"."OutputPracticeType" NOT NULL DEFAULT 'WRITING',
    "languageCode" TEXT NOT NULL DEFAULT 'ja',
    "missionPrompt" TEXT NOT NULL,
    "missionText" TEXT NOT NULL,
    "learnerText" TEXT NOT NULL,
    "aiCoachPrompt" TEXT NOT NULL,
    "aiFeedbackRaw" TEXT NOT NULL,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "comprehensibility" INTEGER NOT NULL DEFAULT 0,
    "accuracy" INTEGER NOT NULL DEFAULT 0,
    "complexity" INTEGER NOT NULL DEFAULT 0,
    "taskCompletion" INTEGER NOT NULL DEFAULT 0,
    "feedbackSummary" TEXT,
    "actionItems" TEXT,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutputPractice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QuestionAttempt" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "timeSpentMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QuestionRetry" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "wrongCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionRetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReviewEvent" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "sourceType" "public"."SourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "deltaDays" INTEGER NOT NULL,
    "scheduledDays" INTEGER NOT NULL,
    "stateBefore" INTEGER NOT NULL,
    "stateAfter" INTEGER NOT NULL,
    "stabilityBefore" DOUBLE PRECISION NOT NULL,
    "stabilityAfter" DOUBLE PRECISION NOT NULL,
    "difficultyBefore" DOUBLE PRECISION NOT NULL,
    "difficultyAfter" DOUBLE PRECISION NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wasOverdue" BOOLEAN NOT NULL,
    "wasRecallSuccess" BOOLEAN NOT NULL,

    CONSTRAINT "ReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SentenceReview" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sourceType" "public"."SourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "due" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "state" INTEGER NOT NULL DEFAULT 0,
    "stability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "elapsed_days" INTEGER NOT NULL DEFAULT 0,
    "scheduled_days" INTEGER NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "learning_steps" INTEGER NOT NULL DEFAULT 0,
    "last_review" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SentenceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StudyTimeDaily" (
    "id" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "kind" "public"."StudyTimeKind" NOT NULL,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyTimeDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Vocabulary" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "sourceType" "public"."SourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "groupName" TEXT,
    "wordAudio" TEXT,
    "pronunciations" TEXT,
    "partsOfSpeech" TEXT,
    "meanings" TEXT,
    "folderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vocabulary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VocabularyFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parentId" TEXT,

    CONSTRAINT "VocabularyFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VocabularyReview" (
    "id" TEXT NOT NULL,
    "vocabularyId" TEXT NOT NULL,
    "due" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "state" INTEGER NOT NULL DEFAULT 0,
    "stability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "elapsed_days" INTEGER NOT NULL DEFAULT 0,
    "scheduled_days" INTEGER NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "learning_steps" INTEGER NOT NULL DEFAULT 0,
    "last_review" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabularyReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VocabularySentence" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "translation" TEXT,
    "audioFile" TEXT,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceType" "public"."SourceType",
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VocabularySentence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VocabularySentenceLink" (
    "id" TEXT NOT NULL,
    "vocabularyId" TEXT NOT NULL,
    "sentenceId" TEXT NOT NULL,
    "meaningIndex" INTEGER,
    "posTags" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VocabularySentenceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VocabularyTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VocabularyTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VocabularyTagOnVocabulary" (
    "vocabularyId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VocabularyTagOnVocabulary_pkey" PRIMARY KEY ("vocabularyId","tagId")
);

-- CreateTable
CREATE TABLE "public"."collection_materials" (
    "id" TEXT NOT NULL,
    "collection_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."collections" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "collection_type" "public"."CollectionType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "parent_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "language" TEXT,
    "level" TEXT,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."grammar_cluster_members" (
    "clusterId" TEXT NOT NULL,
    "grammarId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grammar_cluster_members_pkey" PRIMARY KEY ("clusterId","grammarId")
);

-- CreateTable
CREATE TABLE "public"."grammar_clusters" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grammar_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."grammar_constructions" (
    "id" TEXT NOT NULL,
    "grammar_id" TEXT NOT NULL,
    "connection" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grammar_constructions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."grammar_examples" (
    "id" TEXT NOT NULL,
    "grammar_id" TEXT NOT NULL,
    "source" "public"."GrammarExampleSource" NOT NULL,
    "sentence_text" TEXT NOT NULL,
    "translation" TEXT,
    "note" TEXT,
    "sentence_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "construction_id" TEXT,

    CONSTRAINT "grammar_examples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."grammar_tag_on_grammar" (
    "grammarId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grammar_tag_on_grammar_pkey" PRIMARY KEY ("grammarId","tagId")
);

-- CreateTable
CREATE TABLE "public"."grammar_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grammar_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."grammars" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "meaning" TEXT,
    "usage_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grammars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."material_playtime_stats" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL DEFAULT 'default',
    "material_id" TEXT NOT NULL,
    "total_seconds" INTEGER NOT NULL DEFAULT 0,
    "played_days" INTEGER NOT NULL DEFAULT 0,
    "last_played_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_playtime_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."material_study_progresses" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL DEFAULT 'default',
    "material_id" TEXT NOT NULL,
    "learning_mode" TEXT NOT NULL DEFAULT 'default',
    "progress_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_position" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_study_progresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."materials" (
    "id" TEXT NOT NULL,
    "type" "public"."MaterialType" NOT NULL,
    "title" TEXT NOT NULL,
    "content_payload" JSONB NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "chapter_name" TEXT,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."media_subtitle_lines" (
    "id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "stable_id" TEXT NOT NULL,
    "sequence_id" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "normalized_text" TEXT NOT NULL,
    "search_text" TEXT NOT NULL,
    "note" TEXT,
    "start" DOUBLE PRECISION NOT NULL,
    "end" DOUBLE PRECISION NOT NULL,
    "material_title" TEXT NOT NULL,
    "work_title" TEXT,
    "season" TEXT,
    "episode" TEXT,
    "subtitle_source_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_subtitle_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."questions" (
    "id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "template_type" "public"."QuestionTemplate" NOT NULL DEFAULT 'CHOICE_QUIZ',
    "content" JSONB NOT NULL,
    "prompt" TEXT,
    "context" TEXT,
    "options" JSONB,
    "answer" JSONB NOT NULL,
    "analysis" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "question_type" "public"."QuestionType" NOT NULL DEFAULT 'PRONUNCIATION',

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."wordbook_vocabularies" (
    "id" TEXT NOT NULL,
    "wordbook_id" TEXT NOT NULL,
    "vocabulary_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wordbook_vocabularies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."wordbooks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wordbooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FSRSProfile_profileId_key" ON "public"."FSRSProfile"("profileId" ASC);

-- CreateIndex
CREATE INDEX "GameSessionLog_dateKey_idx" ON "public"."GameSessionLog"("dateKey" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "GameSessionLog_profileId_dateKey_taskKey_key" ON "public"."GameSessionLog"("profileId" ASC, "dateKey" ASC, "taskKey" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "LearningDiary_dateKey_key" ON "public"."LearningDiary"("dateKey" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "MorningRecall_dateKey_key" ON "public"."MorningRecall"("dateKey" ASC);

-- CreateIndex
CREATE INDEX "OutputPractice_dateKey_idx" ON "public"."OutputPractice"("dateKey" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "OutputPractice_profileId_dateKey_practiceType_key" ON "public"."OutputPractice"("profileId" ASC, "dateKey" ASC, "practiceType" ASC);

-- CreateIndex
CREATE INDEX "QuestionRetry_dueAt_idx" ON "public"."QuestionRetry"("dueAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "QuestionRetry_questionId_key" ON "public"."QuestionRetry"("questionId" ASC);

-- CreateIndex
CREATE INDEX "ReviewEvent_profileId_reviewedAt_idx" ON "public"."ReviewEvent"("profileId" ASC, "reviewedAt" ASC);

-- CreateIndex
CREATE INDEX "ReviewEvent_reviewId_reviewedAt_idx" ON "public"."ReviewEvent"("reviewId" ASC, "reviewedAt" ASC);

-- CreateIndex
CREATE INDEX "StudyTimeDaily_dateKey_idx" ON "public"."StudyTimeDaily"("dateKey" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "StudyTimeDaily_dateKey_kind_key" ON "public"."StudyTimeDaily"("dateKey" ASC, "kind" ASC);

-- CreateIndex
CREATE INDEX "VocabularyFolder_parentId_idx" ON "public"."VocabularyFolder"("parentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyFolder_parentId_name_key" ON "public"."VocabularyFolder"("parentId" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "VocabularyReview_due_idx" ON "public"."VocabularyReview"("due" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyReview_vocabularyId_key" ON "public"."VocabularyReview"("vocabularyId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "VocabularySentence_normalizedText_sourceUrl_key" ON "public"."VocabularySentence"("normalizedText" ASC, "sourceUrl" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "VocabularySentenceLink_vocabularyId_sentenceId_key" ON "public"."VocabularySentenceLink"("vocabularyId" ASC, "sentenceId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyTag_name_key" ON "public"."VocabularyTag"("name" ASC);

-- CreateIndex
CREATE INDEX "VocabularyTagOnVocabulary_tagId_idx" ON "public"."VocabularyTagOnVocabulary"("tagId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "collection_materials_collection_id_material_id_key" ON "public"."collection_materials"("collection_id" ASC, "material_id" ASC);

-- CreateIndex
CREATE INDEX "collections_parent_id_sort_order_idx" ON "public"."collections"("parent_id" ASC, "sort_order" ASC);

-- CreateIndex
CREATE INDEX "grammar_cluster_members_grammarId_idx" ON "public"."grammar_cluster_members"("grammarId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "grammar_clusters_title_key" ON "public"."grammar_clusters"("title" ASC);

-- CreateIndex
CREATE INDEX "grammar_constructions_grammar_id_sort_order_idx" ON "public"."grammar_constructions"("grammar_id" ASC, "sort_order" ASC);

-- CreateIndex
CREATE INDEX "grammar_examples_construction_id_idx" ON "public"."grammar_examples"("construction_id" ASC);

-- CreateIndex
CREATE INDEX "grammar_examples_grammar_id_created_at_idx" ON "public"."grammar_examples"("grammar_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "grammar_examples_sentence_id_idx" ON "public"."grammar_examples"("sentence_id" ASC);

-- CreateIndex
CREATE INDEX "grammar_tag_on_grammar_tagId_idx" ON "public"."grammar_tag_on_grammar"("tagId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "grammar_tags_name_key" ON "public"."grammar_tags"("name" ASC);

-- CreateIndex
CREATE INDEX "grammars_name_idx" ON "public"."grammars"("name" ASC);

-- CreateIndex
CREATE INDEX "material_playtime_stats_material_id_updated_at_idx" ON "public"."material_playtime_stats"("material_id" ASC, "updated_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "material_playtime_stats_profile_id_material_id_key" ON "public"."material_playtime_stats"("profile_id" ASC, "material_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "material_study_progresses_profile_id_material_id_learning_m_key" ON "public"."material_study_progresses"("profile_id" ASC, "material_id" ASC, "learning_mode" ASC);

-- CreateIndex
CREATE INDEX "material_study_progresses_updated_at_idx" ON "public"."material_study_progresses"("updated_at" ASC);

-- CreateIndex
CREATE INDEX "media_subtitle_lines_material_id_sequence_id_idx" ON "public"."media_subtitle_lines"("material_id" ASC, "sequence_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "media_subtitle_lines_material_id_stable_id_key" ON "public"."media_subtitle_lines"("material_id" ASC, "stable_id" ASC);

-- CreateIndex
CREATE INDEX "media_subtitle_lines_normalized_text_trgm_idx" ON "public"."media_subtitle_lines" USING GIN ("normalized_text" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "media_subtitle_lines_search_text_trgm_idx" ON "public"."media_subtitle_lines" USING GIN ("search_text" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "media_subtitle_lines_subtitle_source_type_work_title_idx" ON "public"."media_subtitle_lines"("subtitle_source_type" ASC, "work_title" ASC);

-- CreateIndex
CREATE INDEX "wordbook_vocabularies_vocabulary_id_idx" ON "public"."wordbook_vocabularies"("vocabulary_id" ASC);

-- CreateIndex
CREATE INDEX "wordbook_vocabularies_wordbook_id_idx" ON "public"."wordbook_vocabularies"("wordbook_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "wordbook_vocabularies_wordbook_id_vocabulary_id_key" ON "public"."wordbook_vocabularies"("wordbook_id" ASC, "vocabulary_id" ASC);

-- CreateIndex
CREATE INDEX "wordbooks_parentId_idx" ON "public"."wordbooks"("parentId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "wordbooks_parentId_title_key" ON "public"."wordbooks"("parentId" ASC, "title" ASC);

-- AddForeignKey
ALTER TABLE "public"."FSRSProfile" ADD CONSTRAINT "FSRSProfile_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."GameProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GameSessionLog" ADD CONSTRAINT "GameSessionLog_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."GameProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OutputPractice" ADD CONSTRAINT "OutputPractice_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."GameProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QuestionRetry" ADD CONSTRAINT "QuestionRetry_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReviewEvent" ADD CONSTRAINT "ReviewEvent_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."GameProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Vocabulary" ADD CONSTRAINT "Vocabulary_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "public"."VocabularyFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VocabularyFolder" ADD CONSTRAINT "VocabularyFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."VocabularyFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VocabularyReview" ADD CONSTRAINT "VocabularyReview_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "public"."Vocabulary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VocabularySentenceLink" ADD CONSTRAINT "VocabularySentenceLink_sentenceId_fkey" FOREIGN KEY ("sentenceId") REFERENCES "public"."VocabularySentence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VocabularySentenceLink" ADD CONSTRAINT "VocabularySentenceLink_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "public"."Vocabulary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VocabularyTagOnVocabulary" ADD CONSTRAINT "VocabularyTagOnVocabulary_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."VocabularyTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VocabularyTagOnVocabulary" ADD CONSTRAINT "VocabularyTagOnVocabulary_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "public"."Vocabulary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."collection_materials" ADD CONSTRAINT "collection_materials_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."collection_materials" ADD CONSTRAINT "collection_materials_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."collections" ADD CONSTRAINT "collections_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."grammar_cluster_members" ADD CONSTRAINT "grammar_cluster_members_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "public"."grammar_clusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."grammar_cluster_members" ADD CONSTRAINT "grammar_cluster_members_grammarId_fkey" FOREIGN KEY ("grammarId") REFERENCES "public"."grammars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."grammar_constructions" ADD CONSTRAINT "grammar_constructions_grammar_id_fkey" FOREIGN KEY ("grammar_id") REFERENCES "public"."grammars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."grammar_examples" ADD CONSTRAINT "grammar_examples_construction_id_fkey" FOREIGN KEY ("construction_id") REFERENCES "public"."grammar_constructions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."grammar_examples" ADD CONSTRAINT "grammar_examples_grammar_id_fkey" FOREIGN KEY ("grammar_id") REFERENCES "public"."grammars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."grammar_examples" ADD CONSTRAINT "grammar_examples_sentence_id_fkey" FOREIGN KEY ("sentence_id") REFERENCES "public"."VocabularySentence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."grammar_tag_on_grammar" ADD CONSTRAINT "grammar_tag_on_grammar_grammarId_fkey" FOREIGN KEY ("grammarId") REFERENCES "public"."grammars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."grammar_tag_on_grammar" ADD CONSTRAINT "grammar_tag_on_grammar_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."grammar_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."material_playtime_stats" ADD CONSTRAINT "material_playtime_stats_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."material_playtime_stats" ADD CONSTRAINT "material_playtime_stats_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."GameProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."material_study_progresses" ADD CONSTRAINT "material_study_progresses_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."material_study_progresses" ADD CONSTRAINT "material_study_progresses_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."GameProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."media_subtitle_lines" ADD CONSTRAINT "media_subtitle_lines_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."questions" ADD CONSTRAINT "questions_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."wordbook_vocabularies" ADD CONSTRAINT "wordbook_vocabularies_vocabulary_id_fkey" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."Vocabulary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."wordbook_vocabularies" ADD CONSTRAINT "wordbook_vocabularies_wordbook_id_fkey" FOREIGN KEY ("wordbook_id") REFERENCES "public"."wordbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."wordbooks" ADD CONSTRAINT "wordbooks_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."wordbooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
