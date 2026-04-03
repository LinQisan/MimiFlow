-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('AUDIO_DIALOGUE', 'ARTICLE_TEXT', 'QUIZ_QUESTION');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('PRONUNCIATION', 'WORD_DISTINCTION', 'FILL_BLANK', 'GRAMMAR', 'TRANSLATION', 'SORTING', 'READING_COMPREHENSION');

-- CreateEnum
CREATE TYPE "GameDifficultyPreset" AS ENUM ('CONSERVATIVE', 'STANDARD', 'AGGRESSIVE');

-- CreateEnum
CREATE TYPE "StudyTimeKind" AS ENUM ('LESSON_SPEAKING', 'ARTICLE_READING');

-- CreateEnum
CREATE TYPE "OutputPracticeType" AS ENUM ('WRITING');

-- CreateTable
CREATE TABLE "Level" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "audioFile" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dialogue" (
    "id" SERIAL NOT NULL,
    "sequenceId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "start" DOUBLE PRECISION NOT NULL,
    "end" DOUBLE PRECISION NOT NULL,
    "lessonId" TEXT NOT NULL,

    CONSTRAINT "Dialogue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vocabulary" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
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
CREATE TABLE "VocabularyReview" (
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
CREATE TABLE "VocabularyFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VocabularyFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabularySentence" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "translation" TEXT,
    "audioFile" TEXT,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceType" "SourceType",
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VocabularySentence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabularySentenceLink" (
    "id" TEXT NOT NULL,
    "vocabularyId" TEXT NOT NULL,
    "sentenceId" TEXT NOT NULL,
    "meaningIndex" INTEGER,
    "posTags" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VocabularySentenceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentenceReview" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
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
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "quizId" TEXT,
    "questionType" "QuestionType" NOT NULL,
    "contextSentence" TEXT NOT NULL,
    "targetWord" TEXT,
    "prompt" TEXT,
    "explanation" TEXT,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "articleId" TEXT,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionAttempt" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "timeSpentMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionRetry" (
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
CREATE TABLE "GameProfile" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "difficultyPreset" "GameDifficultyPreset" NOT NULL DEFAULT 'STANDARD',
    "coins" INTEGER NOT NULL DEFAULT 0,
    "streakDays" INTEGER NOT NULL DEFAULT 0,
    "lastStreakDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FSRSProfile" (
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
CREATE TABLE "ReviewEvent" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
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
CREATE TABLE "GameSessionLog" (
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
CREATE TABLE "StudyTimeDaily" (
    "id" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "kind" "StudyTimeKind" NOT NULL,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyTimeDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningDiary" (
    "id" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningDiary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MorningRecall" (
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
CREATE TABLE "OutputPractice" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "practiceType" "OutputPracticeType" NOT NULL DEFAULT 'WRITING',
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

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyReview_vocabularyId_key" ON "VocabularyReview"("vocabularyId");

-- CreateIndex
CREATE INDEX "VocabularyReview_due_idx" ON "VocabularyReview"("due");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyFolder_name_key" ON "VocabularyFolder"("name");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularySentence_normalizedText_sourceUrl_key" ON "VocabularySentence"("normalizedText", "sourceUrl");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularySentenceLink_vocabularyId_sentenceId_key" ON "VocabularySentenceLink"("vocabularyId", "sentenceId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionRetry_questionId_key" ON "QuestionRetry"("questionId");

-- CreateIndex
CREATE INDEX "QuestionRetry_dueAt_idx" ON "QuestionRetry"("dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "FSRSProfile_profileId_key" ON "FSRSProfile"("profileId");

-- CreateIndex
CREATE INDEX "ReviewEvent_profileId_reviewedAt_idx" ON "ReviewEvent"("profileId", "reviewedAt");

-- CreateIndex
CREATE INDEX "ReviewEvent_reviewId_reviewedAt_idx" ON "ReviewEvent"("reviewId", "reviewedAt");

-- CreateIndex
CREATE INDEX "GameSessionLog_dateKey_idx" ON "GameSessionLog"("dateKey");

-- CreateIndex
CREATE UNIQUE INDEX "GameSessionLog_profileId_dateKey_taskKey_key" ON "GameSessionLog"("profileId", "dateKey", "taskKey");

-- CreateIndex
CREATE INDEX "StudyTimeDaily_dateKey_idx" ON "StudyTimeDaily"("dateKey");

-- CreateIndex
CREATE UNIQUE INDEX "StudyTimeDaily_dateKey_kind_key" ON "StudyTimeDaily"("dateKey", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "LearningDiary_dateKey_key" ON "LearningDiary"("dateKey");

-- CreateIndex
CREATE UNIQUE INDEX "MorningRecall_dateKey_key" ON "MorningRecall"("dateKey");

-- CreateIndex
CREATE INDEX "OutputPractice_dateKey_idx" ON "OutputPractice"("dateKey");

-- CreateIndex
CREATE UNIQUE INDEX "OutputPractice_profileId_dateKey_practiceType_key" ON "OutputPractice"("profileId", "dateKey", "practiceType");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "Level"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dialogue" ADD CONSTRAINT "Dialogue_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vocabulary" ADD CONSTRAINT "Vocabulary_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "VocabularyFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabularyReview" ADD CONSTRAINT "VocabularyReview_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "Vocabulary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabularySentenceLink" ADD CONSTRAINT "VocabularySentenceLink_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "Vocabulary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabularySentenceLink" ADD CONSTRAINT "VocabularySentenceLink_sentenceId_fkey" FOREIGN KEY ("sentenceId") REFERENCES "VocabularySentence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionRetry" ADD CONSTRAINT "QuestionRetry_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FSRSProfile" ADD CONSTRAINT "FSRSProfile_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "GameProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewEvent" ADD CONSTRAINT "ReviewEvent_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "GameProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSessionLog" ADD CONSTRAINT "GameSessionLog_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "GameProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutputPractice" ADD CONSTRAINT "OutputPractice_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "GameProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

