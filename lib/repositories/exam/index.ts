import prisma from "@/lib/prisma";
import { CollectionType, MaterialType, QuestionType } from "@prisma/client";
import { cache } from "react";
import { getMaterialDisplayTitle } from "../materials/material-title";
import { reorderExamOptionsForSession } from "./exam-option-order";
import { resolveCorrectOrderIds } from "@/modules/questions/domain/sorting";
import {
  toVocabularyMeta,
  type VocabularyMeta,
} from "@/utils/vocabulary/vocabularyMeta";
import {
  normalizeQuestionDisplayText,
  normalizeQuestionTextFields,
} from "@/modules/practice/domain/question-text";
import {
  normalizeOptionLabelFormat,
  parseCustomOptionLabels,
} from "@/utils/questions/optionLabels";
import { decodeMaterialPayloadRecord } from "@/lib/codecs/material-payload";
import { decodeQuestionContent } from "@/lib/codecs/question-content";
import { readJsonRecord, readString } from "@/lib/validation/schema";
import {
  getPaperQuestionSectionNumber,
} from "@/modules/questions/domain/paper-editor";
import { getCurrentUserId } from "@/modules/users/server/current-user";
import { buildExamAnnotationTexts } from "@/modules/practice/domain/exam-annotation-texts";
import { buildRandomPracticeFilterOptions } from "@/modules/practice/domain/custom-session";
import { getAttemptStatsByQuestionIds } from '@/modules/practice/server/attempt-stats';
import { LISTENING_SECTION_FALLBACK, resolveListeningSection } from '@/modules/practice/domain/listening-section';
export { resolveListeningSection } from '@/modules/practice/domain/listening-section';
export { findLevelsWithPapersAndCounts, getPracticePerformanceGroups } from '@/modules/practice/server/paper-overview';
export type { ExamHubPaperSummary, ExamHubLevelSummary, PracticePerformanceGroup } from '@/modules/practice/server/paper-overview';
import { getRandomExamQuestionIdsBySelections } from '@/modules/practice/server/random-question-selection';
export { getRandomExamQuestionIdsBySelections } from '@/modules/practice/server/random-question-selection';
export { japaneseRandomPracticeGroups, genericRandomPracticeGroups } from '@/modules/practice/domain/random-selection';
export type { RandomPracticeSelectionGroup, RandomPracticeScope, RandomPracticeFilters } from '@/modules/practice/domain/random-selection';
import type { RandomPracticeFilters } from '@/modules/practice/domain/random-selection';

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function toAnswerIds(answer: unknown): string[] {
  if (typeof answer === "string" && answer.length > 0) return [answer];
  if (Array.isArray(answer)) {
    return answer.filter((item) => typeof item === "string") as string[];
  }
  return [];
}

function buildQuestionView(
  row: {
    id: string;
    note: string | null;
    attempts?: Array<{ isCorrect: boolean }>;
    attemptCount?: number;
    correctAttemptCount?: number;
    questionType: QuestionType;
    content: unknown;
    prompt: string | null;
    context: string | null;
    options: unknown;
    answer: unknown;
    sortOrder: number;
  },
  material: {
    id: string;
    type: MaterialType;
    title?: string | null;
    chapterName?: string | null;
    contentPayload: unknown;
    metadata?: unknown;
  },
  fallbackOrder: number,
  paperLanguage?: string | null,
) {
  const content = decodeQuestionContent(row.content);
  const payload = decodeMaterialPayloadRecord(
    material.type,
    material.contentPayload,
  );
  const questionType = row.questionType;
  const answerIds = new Set(toAnswerIds(row.answer));
  const listeningSection =
    material.type === MaterialType.LISTENING
      ? resolveListeningSection({
          content,
          payload,
          metadata: readJsonRecord(material.metadata),
          chapterName: material.chapterName || material.title,
          questionType,
          language: paperLanguage,
        })
      : null;

  const options = asArray<Record<string, unknown>>(row.options).map((item) => {
    const id = readString(item.id) || "";
    return {
      id,
      text: readString(item.text) || "",
      imageUrl: readString(item.imageUrl) || null,
      isCorrect: answerIds.has(id),
    };
  });
  const shuffleOptions =
    content.shuffleOptions !== false && listeningSection?.partNumber !== 3;
  const orderedOptions = reorderExamOptionsForSession(
    options,
    questionType,
    shuffleOptions,
    listeningSection?.partNumber,
  );

  const base = {
    id: row.id,
    note: row.note,
    attempts: row.attempts || [],
    attemptCount: row.attemptCount,
    correctAttemptCount: row.correctAttemptCount,
    order: row.sortOrder || fallbackOrder,
    questionType,
    prompt: normalizeQuestionDisplayText(row.prompt),
    contextSentence: normalizeQuestionDisplayText(row.context),
    targetWord: readString(content.targetWord),
    options: orderedOptions,
    authoredOptions: options,
    optionLabelFormat: readString(content.optionLabelFormat)
      ? normalizeOptionLabelFormat(content.optionLabelFormat)
      : null,
    customOptionLabels: parseCustomOptionLabels(content.customOptionLabels),
    shuffleOptions,
    correctOrder: resolveCorrectOrderIds(options, content.sortingOrder),
    imageUrl: readString(content.imageUrl),
  };

  if (material.type === MaterialType.READING) {
    return {
      ...base,
      passageId: material.id,
      passage: {
        id: material.id,
        content: readString(payload.text),
      },
    };
  }

  if (material.type === MaterialType.LISTENING) {
    const rawDialogues = asArray<Record<string, unknown>>(payload.dialogues);
    const section = listeningSection || LISTENING_SECTION_FALLBACK;
    const dialogues = rawDialogues.map((item, index) => ({
      id: Number(item.id ?? index + 1),
      text: readString(item.text) || "",
      start: Number(item.start ?? 0),
      end: Number(item.end ?? 0),
      sequenceId: Number(item.sequenceId ?? index + 1),
    }));

    return {
      ...base,
      lessonId: material.id,
      lesson: {
        id: material.id,
        audioFile:
          readString(payload.audioFile),
        sectionKey: section.key,
        sectionTitle: section.title,
        sectionNumber: section.partNumber,
        dialogues,
      },
    };
  }

  return base;
}

async function buildVocabularyMaps(userId: string, relevantText: string) {
  if (!relevantText) return { pronunciationMap: {}, vocabularyMetaMap: {} };
  const metadataFilter = {
    userId,
    OR: [
      { pronunciations: { not: null } },
      { senses: { some: { definitions: { some: {} } } } },
    ],
  };
  const selectMetadata = {
    word: true,
    pronunciations: true,
    partsOfSpeech: true,
    senses: {
      orderBy: { order: "asc" as const },
      select: {
        definitions: {
          orderBy: { sortOrder: "asc" as const },
          select: { definition: true },
        },
      },
    },
  } as const;
  const matchedWords = Array.from(
    new Set(
      (
        await prisma.vocabulary.findMany({
          where: { userId },
          select: { word: true },
        })
      )
        .map(item => item.word)
        .filter(word => word && relevantText.includes(word)),
    ),
  );
  const relevantVocabularyRows = matchedWords.length
    ? await prisma.vocabulary.findMany({
        where: {
          ...metadataFilter,
          word: { in: matchedWords },
        },
        select: selectMetadata,
      })
    : [];
  const pronunciationMap: Record<string, string> = {};
  const vocabularyMetaMap = relevantVocabularyRows.reduce<
    Record<string, VocabularyMeta>
  >((acc, item) => {
    const meta = toVocabularyMeta({ ...item, word: item.word });
    acc[item.word] = meta;
    if (meta.pronunciations[0])
      pronunciationMap[item.word] = meta.pronunciations[0];
    return acc;
  }, {});

  return { pronunciationMap, vocabularyMetaMap };
}

export async function findPaperDetailById(id: string) {
  const userId = await getCurrentUserId();
  const collection = await prisma.collection.findFirst({
    where: {
      id,
    },
    include: {
      practiceSubmissions: {
        where: { userId },
        orderBy: { completedAt: "desc" },
        take: 20,
        select: {
          id: true,
          questionCount: true,
          correctCount: true,
          languageScore: true,
          readingScore: true,
          listeningScore: true,
          totalScore: true,
          passLine: true,
          passed: true,
          completedAt: true,
        },
      },
      materials: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        include: {
          material: {
            include: {
              questions: {
                orderBy: { sortOrder: "asc" },
                select: {
                  id: true,
                  questionType: true,
                  content: true,
                  prompt: true,
                  context: true,
                  options: true,
                  sortOrder: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!collection) return null;

  const quizzes = collection.materials
    .map((item) => item.material)
    .filter((material) => material.type === MaterialType.VOCAB_GRAMMAR)
    .map((material) => {
      const contentPayload = decodeMaterialPayloadRecord(
        material.type,
        material.contentPayload,
      );
      return {
        id: material.id,
        materialType: material.type as
          "SPEAKING" | "LISTENING" | "READING" | "VOCAB_GRAMMAR",
        title: getMaterialDisplayTitle(
          material.type,
          material.title,
          material.contentPayload,
          material.id,
        ),
        description: readString(contentPayload.description),
        questions: material.questions.map((question, index) => {
          return {
            id: question.id,
            questionType: question.questionType,
            prompt: normalizeQuestionDisplayText(question.prompt),
            contextSentence: normalizeQuestionDisplayText(question.context),
            options: asArray<Record<string, unknown>>(question.options)
              .map(option => readString(option.text))
              .filter(Boolean),
            order: question.sortOrder || index + 1,
          };
        }),
      };
    });

  const lessons = collection.materials
    .map((item) => item.material)
    .filter((material) => material.type === MaterialType.LISTENING)
    .map((material) => {
      const payload = decodeMaterialPayloadRecord(
        material.type,
        material.contentPayload,
      );
      const metadata = readJsonRecord(material.metadata);
      const dialogueTranscript = asArray<Record<string, unknown>>(
        payload.dialogues,
      )
        .map(dialogue => readString(dialogue.text))
        .filter(Boolean)
        .join("\n");
      return {
        id: material.id,
        materialType: material.type as
          "SPEAKING" | "LISTENING" | "READING" | "VOCAB_GRAMMAR",
        title: getMaterialDisplayTitle(
          material.type,
          material.title,
          material.contentPayload,
          material.id,
        ),
        audioFile:
          readString(payload.audioFile),
        transcript:
          dialogueTranscript ||
          readString(payload.transcript) ||
          readString(payload.text),
        questions: material.questions.map((question, index) => {
          const content = decodeQuestionContent(question.content);
          const section = resolveListeningSection({
            content,
            payload,
            metadata,
            chapterName: material.chapterName || material.title,
            questionType: question.questionType,
            language: collection.language,
          });
          return {
            id: question.id,
            questionType: question.questionType,
            prompt: normalizeQuestionDisplayText(question.prompt),
            contextSentence: normalizeQuestionDisplayText(question.context),
            options: asArray<Record<string, unknown>>(question.options)
              .map(option => readString(option.text))
              .filter(Boolean),
            sectionKey: section.key,
            sectionTitle: section.title,
            sectionNumber: section.partNumber,
            order: question.sortOrder || index + 1,
          };
        }),
      };
    });

  const passages = collection.materials
    .map((item) => item.material)
    .filter((material) => material.type === MaterialType.READING)
    .map((material) => {
      const payload = decodeMaterialPayloadRecord(
        material.type,
        material.contentPayload,
      );
      return {
        id: material.id,
        materialType: material.type as
          "SPEAKING" | "LISTENING" | "READING" | "VOCAB_GRAMMAR",
        title: getMaterialDisplayTitle(
          material.type,
          material.title,
          material.contentPayload,
          material.id,
        ),
        content:
          readString(payload.text) || readString(payload.transcript) || "",
        questions: material.questions.map((question, index) => {
          return {
            id: question.id,
            questionType: question.questionType,
            prompt: normalizeQuestionDisplayText(question.prompt),
            contextSentence: normalizeQuestionDisplayText(question.context),
            options: asArray<Record<string, unknown>>(question.options)
              .map(option => readString(option.text))
              .filter(Boolean),
            order: question.sortOrder || index + 1,
          };
        }),
      };
    });

  return {
    id: collection.id,
    name: collection.title,
    collectionType: collection.collectionType,
    description: collection.description,
    language: collection.language,
    level: collection.level,
    parentId: collection.parentId,
    sortOrder: collection.sortOrder,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
    quizzes,
    lessons,
    passages,
    practiceSubmissions: collection.practiceSubmissions,
  };
}

export async function getManagePaperEditData(paperId: string) {
  const collection = await prisma.collection.findUnique({
    where: { id: paperId },
    include: {
      materials: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        include: {
          material: {
            include: {
              questions: {
                orderBy: { sortOrder: "asc" },
                select: {
                  id: true,
                  questionType: true,
                  content: true,
                  prompt: true,
                  context: true,
                  options: true,
                  answer: true,
                  analysis: true,
                  sortOrder: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!collection) return null;

  const materials = collection.materials.map((relation) => {
    const material = relation.material;
    const payload = decodeMaterialPayloadRecord(
      material.type,
      material.contentPayload,
    );
    const metadata = readJsonRecord(material.metadata);
    const materialListeningSection =
      material.type === MaterialType.LISTENING
        ? resolveListeningSection({
            content: {},
            payload,
            metadata,
            chapterName: material.chapterName || material.title,
            language: collection.language,
          })
        : null;
    return {
      id: material.id,
      materialType: material.type,
      title: getMaterialDisplayTitle(
        material.type,
        material.title,
        material.contentPayload,
        material.id,
      ),
      sortOrder: relation.sortOrder,
      questionCount: material.questions.length,
      listeningSectionTitle: materialListeningSection?.title || "",
      listeningSectionKey: materialListeningSection?.key || "",
      listeningSectionNumber: materialListeningSection?.partNumber
        ? String(materialListeningSection.partNumber)
        : "",
      questions: material.questions.map((row, index) => {
        const content = decodeQuestionContent(row.content);
        const questionText = normalizeQuestionTextFields(
          row.prompt,
          row.context,
        );
        const answerIds = new Set(toAnswerIds(row.answer));
        const listeningSection =
          material.type === MaterialType.LISTENING
            ? resolveListeningSection({
                content,
                payload,
                metadata,
                chapterName: material.chapterName || material.title,
                questionType: row.questionType,
                language: collection.language,
              })
            : null;
        const options = asArray<Record<string, unknown>>(row.options).map(
          (item, optionIndex) => {
            const id = readString(item.id) || `opt_${optionIndex + 1}`;
            return {
              id,
              text: readString(item.text) || "",
              imageUrl: readString(item.imageUrl) || null,
              isCorrect: answerIds.has(id),
            };
          },
        );

        return {
          id: row.id,
          questionType: row.questionType,
          prompt: questionText.prompt || "",
          contextSentence: questionText.context || "",
          explanation: row.analysis || "",
          listeningSectionTitle: listeningSection?.title || "",
          listeningSectionKey: listeningSection?.key || "",
          listeningSectionNumber: listeningSection?.partNumber
            ? String(listeningSection.partNumber)
            : "",
          optionLabelFormat: normalizeOptionLabelFormat(
            content.optionLabelFormat,
            "numeric",
          ),
          customOptionLabels: parseCustomOptionLabels(
            content.customOptionLabels,
          ).join("|"),
          shuffleOptions: content.shuffleOptions !== false,
          sortingOrder: Array.isArray(content.sortingOrder)
            ? content.sortingOrder
            : [],
          sortOrder: row.sortOrder || index + 1,
          options,
        };
      }),
    };
  });

  return {
    id: collection.id,
    title: collection.title,
    description: collection.description,
    language: collection.language,
    level: collection.level,
    materials,
  };
}

export async function getManagePaperMoveTargets(currentPaperId: string) {
  return prisma.collection.findMany({
    where: {
      collectionType: CollectionType.PAPER,
      id: { not: currentPaperId },
    },
    orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      level: true,
    },
  });
}

const getExamPaperQuestions = cache(
  async (paperId: string) => prisma.collection.findFirst({
    where: {
      id: paperId,
    },
    select: {
      title: true,
      language: true,
      materials: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: {
          material: {
            select: {
              id: true,
              type: true,
              title: true,
              chapterName: true,
              contentPayload: true,
              metadata: true,
              questions: {
                orderBy: { sortOrder: "asc" },
                select: {
                  id: true,
                  questionType: true,
                  content: true,
                  prompt: true,
                  context: true,
                  options: true,
                  answer: true,
                  sortOrder: true,
                },
              },
            },
          },
        },
      },
    },
  }),
);

export async function getExamQuestionsByPaperId(paperId: string) {
  const [userId, collection] = await Promise.all([
    getCurrentUserId(),
    getExamPaperQuestions(paperId),
  ]);

  if (!collection) return null;

  const questionIds = collection.materials.flatMap(relation =>
    relation.material.questions.map(question => question.id),
  );
  const [noteRows, attemptGroups] = questionIds.length > 0
    ? await Promise.all([
        prisma.userQuestionNote.findMany({
          where: { userId, questionId: { in: questionIds } },
          select: { questionId: true, note: true },
        }),
        getAttemptStatsByQuestionIds(userId, questionIds),
      ])
    : [[], new Map<string, { total: number; correct: number }>()];
  const noteByQuestionId = new Map(
    noteRows.map(row => [row.questionId, row.note]),
  );
  const attemptStatsByQuestionId = attemptGroups;

  type OrderedExamQuestion = ReturnType<typeof buildQuestionView> & {
    sourceOrder: number;
    materialType: MaterialType;
    sectionNumber: number;
  };
  const languageQs: OrderedExamQuestion[] = [];
  const listeningQs: OrderedExamQuestion[] = [];
  const sharedPassages = new Map<
    string,
    { id: string; content: string }
  >();
  const sharedLessons = new Map<
    string,
    {
      id: string;
      audioFile: string;
      sectionKey: string;
      sectionTitle: string;
      sectionNumber: number | null;
      dialogues: Array<{
        id: number;
        text: string;
        start: number;
        end: number;
        sequenceId: number;
      }>;
    }
  >();
  let sourceOrder = 0;

  for (const relation of collection.materials) {
    const material = relation.material;
    if (
      material.type !== MaterialType.LISTENING &&
      material.type !== MaterialType.READING &&
      material.type !== MaterialType.VOCAB_GRAMMAR
    ) {
      continue;
    }
    const questions = material.questions.map((row, index) => {
      sourceOrder += 1;
      const question = buildQuestionView(
        {
          ...row,
          note: noteByQuestionId.get(row.id) || null,
          attemptCount: attemptStatsByQuestionId.get(row.id)?.total || 0,
          correctAttemptCount:
            attemptStatsByQuestionId.get(row.id)?.correct || 0,
        },
        material,
        index + 1,
        collection.language,
      );
      if ("passage" in question && question.passage) {
        const sharedPassage =
          sharedPassages.get(material.id) || question.passage;
        sharedPassages.set(material.id, sharedPassage);
        question.passage = sharedPassage;
      }
      if ("lesson" in question && question.lesson) {
        const sharedLesson = sharedLessons.get(material.id) || question.lesson;
        sharedLessons.set(material.id, sharedLesson);
        question.lesson = sharedLesson;
      }
      const sectionNumber =
        material.type === MaterialType.LISTENING && "lesson" in question
          ? question.lesson.sectionNumber || Number.MAX_SAFE_INTEGER
          : getPaperQuestionSectionNumber(material.type, row.questionType);
      return {
        ...question,
        sourceOrder,
        materialType: material.type,
        sectionNumber,
      };
    });

    if (
      material.type === MaterialType.VOCAB_GRAMMAR ||
      material.type === MaterialType.READING
    ) {
      languageQs.push(...questions);
      continue;
    }

    if (material.type === MaterialType.LISTENING) {
      listeningQs.push(...questions);
    }
  }

  const bySectionThenSource = (
    a: OrderedExamQuestion,
    b: OrderedExamQuestion,
  ) => a.sectionNumber - b.sectionNumber || a.sourceOrder - b.sourceOrder;
  languageQs.sort(bySectionThenSource);
  listeningQs.sort(bySectionThenSource);

  const allQuestions = [...languageQs, ...listeningQs].map(
    ({
      sourceOrder: _sourceOrder,
      materialType: _materialType,
      sectionNumber: _sectionNumber,
      ...question
    }) => {
      void _sourceOrder;
      void _materialType;
      void _sectionNumber;
      return question;
    },
  );
  const { pronunciationMap, vocabularyMetaMap } =
    await buildVocabularyMaps(
      userId,
      buildExamAnnotationTexts(allQuestions).join("\n"),
    );

  return {
    paperTitle: collection.title,
    paperLanguage: collection.language,
    questions: allQuestions,
    pronunciationMap,
    vocabularyMetaMap,
  };
}

export async function getPracticeSubmissionReview(
  paperId: string,
  submissionId: string,
) {
  const userId = await getCurrentUserId();
  const submission = await prisma.practicePaperSubmission.findFirst({
    where: {
      id: submissionId,
      collectionId: paperId,
      userId,
    },
    select: {
      id: true,
      questionCount: true,
      correctCount: true,
      languageScore: true,
      readingScore: true,
      listeningScore: true,
      totalScore: true,
      passed: true,
      completedAt: true,
      attempts: {
        orderBy: { createdAt: "asc" },
        select: {
          questionId: true,
          isCorrect: true,
          selectedOptionId: true,
          correctOptionId: true,
          selectedOrder: true,
          timeSpentMs: true,
        },
      },
    },
  });
  if (!submission) return null;

  const examData = await getExamQuestionsByPaperId(paperId);
  if (!examData) return null;

  const attemptByQuestionId = new Map(
    submission.attempts.map(attempt => [attempt.questionId, attempt]),
  );
  const submissionQuestions = examData.questions
    .filter(question => attemptByQuestionId.has(question.id))
    .map(question => ({
      question,
      attempt: attemptByQuestionId.get(question.id)!,
    }));

  return {
    submission,
    submissionQuestions,
    paperTitle: examData.paperTitle,
    paperLanguage: examData.paperLanguage,
    pronunciationMap: examData.pronunciationMap,
    vocabularyMetaMap: examData.vocabularyMetaMap,
  };
}

export async function getExamQuestionsByIds(
  questionIds: string[],
  options?: {
    language?: string | null;
    paperTitle?: string;
  },
) {
  const userId = await getCurrentUserId();
  const normalizedLanguage = (options?.language || "").trim();

  if (questionIds.length === 0) {
    return {
      paperTitle: options?.paperTitle || "自定义练习",
      paperLanguage: normalizedLanguage || null,
      sourceCollections: [] as string[],
      questions: [] as ReturnType<typeof buildQuestionView>[],
      pronunciationMap: {} as Record<string, string>,
      vocabularyMetaMap: {} as Record<string, VocabularyMeta>,
      selectedCount: 0,
    };
  }

  const [questionRows, attemptStatsByQuestionId] = await Promise.all([
    prisma.question.findMany({
      where: { id: { in: questionIds } },
      include: {
        userNotes: {
          where: { userId },
          take: 1,
          select: { note: true },
        },
        material: {
          select: {
            id: true,
            type: true,
            contentPayload: true,
            collectionMaterials: {
              orderBy: { sortOrder: "asc" },
              take: 1,
              select: {
                collection: {
                  select: {
                    title: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    getAttemptStatsByQuestionIds(userId, questionIds),
  ]);

  const byId = new Map(questionRows.map((row) => [row.id, row]));
  const questions = questionIds
    .map((id, index) => {
      const row = byId.get(id);
      if (!row) return null;
      return buildQuestionView(
        {
          id: row.id,
          note: row.userNotes[0]?.note || null,
          attemptCount: attemptStatsByQuestionId.get(row.id)?.total || 0,
          correctAttemptCount: attemptStatsByQuestionId.get(row.id)?.correct || 0,
          questionType: row.questionType,
          content: row.content,
          prompt: row.prompt,
          context: row.context,
          options: row.options,
          answer: row.answer,
          sortOrder: row.sortOrder,
        },
        row.material,
        index + 1,
        normalizedLanguage || null,
      );
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const sourceCollections = Array.from(
    new Set(
      questionRows
        .map(
          (row) =>
            row.material.collectionMaterials[0]?.collection.title?.trim() || "",
        )
        .filter(Boolean),
    ),
  );

  const { pronunciationMap, vocabularyMetaMap } =
    await buildVocabularyMaps(
      userId,
      buildExamAnnotationTexts(questions).join("\n"),
    );

  return {
    paperTitle: options?.paperTitle || "自定义练习",
    paperLanguage: normalizedLanguage || null,
    sourceCollections,
    questions,
    pronunciationMap,
    vocabularyMetaMap,
    selectedCount: questions.length,
  };
}

export async function getRandomExamQuestionsBySelections(
  selectionKeys: string[],
  requestedCount: number,
  filters?: RandomPracticeFilters,
) {
  const uniqueIds = await getRandomExamQuestionIdsBySelections(
    selectionKeys,
    requestedCount,
    filters,
  );
  return getExamQuestionsByIds(uniqueIds, {
    language: filters?.language,
    paperTitle: "自定义练习",
  });
}

export async function getRandomPracticeFilterOptions() {
  const collections = await prisma.collection.findMany({
    where: {
      materials: {
        some: {},
      },
    },
    select: {
      language: true,
      level: true,
    },
  });

  return buildRandomPracticeFilterOptions(collections);
}
