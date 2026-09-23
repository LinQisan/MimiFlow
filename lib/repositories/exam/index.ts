import { normalizeQuestionSectionTitle } from '@/modules/questions/domain/section-heading';
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
  getReadingQuestionSection,
  getVocabGrammarQuestionSection,
} from "@/modules/questions/domain/paper-editor";
import {
  getToeicPartByNumber,
  getToeicPartByQuestionType,
} from "@/modules/questions/domain/toeic";
import { getCurrentUserId } from "@/modules/users/server/current-user";
import { buildExamAnnotationTexts } from "@/modules/practice/domain/exam-annotation-texts";
import { buildRandomPracticeFilterOptions } from "@/modules/practice/domain/custom-session";
import { getAttemptStatsByQuestionIds } from '@/modules/practice/server/attempt-stats';

export type ExamHubPaperSummary = {
  id: string;
  name: string;
  collectionType: CollectionType;
  description: string | null;
  language: string | null;
  level: string | null;
  parentId: string | null;
  sortOrder: number;
  createdAt: string | Date;
  updatedAt: string | Date;
  passageCount: number;
  lessonCount: number;
  quizCount: number;
  moduleCount: number;
  questionCount: number;
  lessonQuestionCount: number;
  listeningSectionCount: number;
  quizQuestionCount: number;
  textVocabularyQuestionCount: number;
  grammarQuestionCount: number;
  readingQuestionCount: number;
  completedPracticeCount: number;
  latestPracticeScore: number | null;
  latestPracticePassed: boolean | null;
  attemptCount: number;
  attemptCorrectCount: number;
  attemptAccuracyPct: number | null;
  manageSections: ExamHubManageSection[];
};

export type ExamHubLevelSummary = {
  id: string;
  title: string;
  papers: ExamHubPaperSummary[];
};

type PracticeQuestionTypeStat = {
  key: string;
  category: string;
  sectionNumber: number;
  label: string;
  attemptCount: number;
  correctCount: number;
  accuracyPct: number;
  averageTimeMs: number | null;
};

export type PracticePerformanceGroup = {
  key: string;
  language: string;
  level: string;
  attemptCount: number;
  correctCount: number;
  accuracyPct: number;
  averageTimeMs: number | null;
  questionTypes: PracticeQuestionTypeStat[];
};

type ExamHubManageSection = {
  key: string;
  label: string;
  detail: string;
  materialType: MaterialType;
  questionCount: number;
  materialCount: number;
  sectionNumber: number | null;
};

type RandomPracticeSelectionOption = {
  key: string;
  label: string;
  sectionNumber: number | null;
};

export type RandomPracticeSelectionGroup = {
  key: string;
  label: string;
  options: ReadonlyArray<RandomPracticeSelectionOption>;
};

export const japaneseRandomPracticeGroups: ReadonlyArray<RandomPracticeSelectionGroup> = [
  {
    key: "TEXT_VOCAB",
    label: "文字・語彙",
    options: [
      { key: "LANGUAGE:1", label: "問題1｜漢字読み", sectionNumber: 1 },
      { key: "LANGUAGE:2", label: "問題2｜文脈規定", sectionNumber: 2 },
      { key: "LANGUAGE:3", label: "問題3｜言い換え類義", sectionNumber: 3 },
      { key: "LANGUAGE:4", label: "問題4｜用法", sectionNumber: 4 },
    ],
  },
  {
    key: "GRAMMAR",
    label: "文法",
    options: [
      { key: "LANGUAGE:5", label: "問題5｜文の文法1", sectionNumber: 5 },
      { key: "LANGUAGE:6", label: "問題6｜文の文法2", sectionNumber: 6 },
      { key: "LANGUAGE:7", label: "問題7｜文章の文法", sectionNumber: 7 },
    ],
  },
  {
    key: "READING",
    label: "読解",
    options: [
      { key: "LANGUAGE:8", label: "問題8｜内容理解（短文）", sectionNumber: 8 },
      { key: "LANGUAGE:9", label: "問題9｜内容理解（中文）", sectionNumber: 9 },
      { key: "LANGUAGE:10", label: "問題10｜内容理解（長文）", sectionNumber: 10 },
      { key: "LANGUAGE:11", label: "問題11｜統合理解", sectionNumber: 11 },
      { key: "LANGUAGE:12", label: "問題12｜主張理解（長文）", sectionNumber: 12 },
      { key: "LANGUAGE:13", label: "問題13｜情報検索", sectionNumber: 13 },
    ],
  },
  {
    key: "LISTENING",
    label: "聴解",
    options: [
      { key: "LISTENING:1", label: "問題1｜課題理解", sectionNumber: 1 },
      { key: "LISTENING:2", label: "問題2｜ポイント理解", sectionNumber: 2 },
      { key: "LISTENING:3", label: "問題3｜概要理解", sectionNumber: 3 },
      { key: "LISTENING:4", label: "問題4｜即時応答", sectionNumber: 4 },
      { key: "LISTENING:5", label: "問題5｜統合理解", sectionNumber: 5 },
    ],
  },
];

export const genericRandomPracticeGroups: ReadonlyArray<RandomPracticeSelectionGroup> = [
  {
    key: "LISTENING",
    label: "听力",
    options: [{ key: "MATERIAL:LISTENING", label: "全部听力", sectionNumber: null }],
  },
  {
    key: "READING",
    label: "阅读",
    options: [{ key: "MATERIAL:READING", label: "全部阅读", sectionNumber: null }],
  },
  {
    key: "VOCAB_GRAMMAR",
    label: "语言题",
    options: [
      { key: "MATERIAL:VOCAB_GRAMMAR", label: "词汇与语法", sectionNumber: null },
    ],
  },
];
export type RandomPracticeScope = "unattempted" | "attempted" | "all";
export type RandomPracticeFilters = {
  language?: string;
  level?: string;
  scope?: RandomPracticeScope;
};

function shuffleList<T>(list: T[]): T[] {
  const copied = [...list];
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}

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

const LISTENING_SECTION_FALLBACK = {
  key: "listening",
  title: "听力",
  partNumber: null,
};

function normalizeSectionKey(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value))
      return String(value);
  }
  return "";
}

function toPositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.floor(value);
    return normalized > 0 ? normalized : null;
  }
  if (typeof value === "string" && value.trim()) {
    const match = value.trim().match(/\d+/);
    if (!match) return null;
    const normalized = Number(match[0]);
    return Number.isFinite(normalized) && normalized > 0
      ? Math.floor(normalized)
      : null;
  }
  return null;
}

export function resolveListeningSection({
  content,
  payload,
  chapterName,
  questionType,
  language,
}: {
  content: Record<string, unknown>;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  chapterName?: string | null;
  questionType?: string | null;
  language?: string | null;
}) {
  const typedToeicPart = getToeicPartByQuestionType(questionType || "");
  if (typedToeicPart) {
    return {
      key: `toeic-part-${typedToeicPart.part}`,
      title: `Part ${typedToeicPart.part} · ${typedToeicPart.title}`,
      partNumber: typedToeicPart.part,
    };
  }

  const explicitTitle = firstString(
    payload.listeningSectionTitle,
    content.listeningSectionTitle,
  );
  const normalizedLanguage = (language || "").trim().toLowerCase();
  const isEnglish =
    normalizedLanguage === "en" || normalizedLanguage.startsWith("en-");
  const toeicPartMatch = isEnglish
    ? [
        chapterName,
        explicitTitle,
      ]
        .filter((value): value is string => typeof value === "string")
        .join(" ")
        .match(/\b(?:pt|part)\s*([1-7])\b/i)
    : null;
  const inferredToeicPart = toeicPartMatch
    ? getToeicPartByNumber(Number(toeicPartMatch[1]))
    : null;
  if (inferredToeicPart) {
    return {
      key: `toeic-part-${inferredToeicPart.part}`,
      title: `Part ${inferredToeicPart.part} · ${inferredToeicPart.title}`,
      partNumber: inferredToeicPart.part,
    };
  }
  const titleFromChapter = chapterName
    ?.match(/(?:問題|问题)\s*\d+(?:\s*[-_－]\s*\d+)?\s*[｜|]\s*(.+)$/i)?.[1]
    ?.trim();
  const explicitPart = toPositiveInteger(
    content.listeningSectionNumber ?? payload.listeningSectionNumber,
  );
  if (explicitPart) {
    return {
      key: `listening-part-${explicitPart}`,
      title: isEnglish ? explicitTitle || titleFromChapter || "听力" : normalizeQuestionSectionTitle(explicitTitle || titleFromChapter || "听力", explicitPart),
      partNumber: explicitPart,
    };
  }

  const title = firstString(
    content.listeningSectionTitle,
    payload.listeningSectionTitle,
    chapterName,
  );

  if (!title) return LISTENING_SECTION_FALLBACK;
  const canonicalTitle = title.match(
    /(?:問題|问题)\s*(\d+)(?:\s*[-_－]\s*\d+)?\s*[｜|]\s*(.+)$/i,
  );
  if (canonicalTitle) {
    const sectionNumber = toPositiveInteger(canonicalTitle[1]);
    const sectionTitle = canonicalTitle[2]?.trim();
    if (sectionNumber && sectionTitle) {
      return {
        key: `listening-part-${sectionNumber}`,
        title: normalizeQuestionSectionTitle(sectionTitle, sectionNumber),
        partNumber: sectionNumber,
      };
    }
  }
  const titlePart = toPositiveInteger(title);
  if (titlePart && /部分|part|問題|问题|大题/i.test(title)) {
    return {
      key: `listening-part-${titlePart}`,
      title: "听力",
      partNumber: titlePart,
    };
  }

  return {
    key: normalizeSectionKey(title) || LISTENING_SECTION_FALLBACK.key,
    title,
    partNumber: null,
  };
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

export async function findLevelsWithPapersAndCounts(): Promise<
  ExamHubLevelSummary[]
> {
  const userId = await getCurrentUserId();
  const collections = await prisma.collection.findMany({
    where: {
      collectionType: CollectionType.PAPER,
      materials: {
        some: {},
      },
    },
    orderBy: {
      title: "asc",
    },
    include: {
      _count: {
        select: {
          practiceSubmissions: { where: { userId } },
        },
      },
      practiceSubmissions: {
        where: { userId },
        orderBy: { completedAt: "desc" },
        take: 1,
        select: {
          totalScore: true,
          passed: true,
        },
      },
      materials: {
        include: {
          material: {
            select: {
              id: true,
              type: true,
              chapterName: true,
              contentPayload: true,
              metadata: true,
              questions: {
                select: {
                  id: true,
                  questionType: true,
                  content: true,
                  attempts: {
                    where: { userId },
                    select: {
                      isCorrect: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const papers = collections
    .map((collection) => {
      const materials = collection.materials.map((item) => item.material);
      const lessonMaterials = materials.filter(
        (item) => item.type === MaterialType.LISTENING,
      );
      const readingMaterials = materials.filter(
        (item) => item.type === MaterialType.READING,
      );
      const quizMaterials = materials.filter(
        (item) => item.type === MaterialType.VOCAB_GRAMMAR,
      );

      const lessonQuestionCount = lessonMaterials.reduce(
        (sum, item) => sum + item.questions.length,
        0,
      );
      const listeningSectionKeys = new Set<string>();
      for (const material of lessonMaterials) {
        const payload = decodeMaterialPayloadRecord(
          material.type,
          material.contentPayload,
        );
        const metadata = readJsonRecord(material.metadata);
        if (material.questions.length === 0) {
          const section = resolveListeningSection({
            content: {},
            payload,
            metadata,
            chapterName: material.chapterName,
          });
          listeningSectionKeys.add(section.key);
          continue;
        }
        for (const question of material.questions) {
          const section = resolveListeningSection({
            content: decodeQuestionContent(question.content),
            payload,
            metadata,
            chapterName: material.chapterName,
          });
          listeningSectionKeys.add(section.key);
        }
      }
      const quizQuestionCount = quizMaterials.reduce(
        (sum, item) => sum + item.questions.length,
        0,
      );
      const readingQuestionCount = readingMaterials.reduce(
        (sum, item) => sum + item.questions.length,
        0,
      );
      const textVocabularyQuestionCount = quizMaterials.reduce(
        (sum, material) =>
          sum +
          material.questions.filter((question) => {
            const sectionNumber = getPaperQuestionSectionNumber(
              material.type,
              question.questionType,
            );
            return sectionNumber >= 1 && sectionNumber <= 4;
          }).length,
        0,
      );
      const grammarQuestionCount = [...quizMaterials, ...readingMaterials].reduce(
        (sum, material) =>
          sum +
          material.questions.filter((question) => {
            const sectionNumber = getPaperQuestionSectionNumber(
              material.type,
              question.questionType,
            );
            return sectionNumber >= 5 && sectionNumber <= 7;
          }).length,
        0,
      );
      const readingComprehensionQuestionCount = readingMaterials.reduce(
        (sum, material) =>
          sum +
          material.questions.filter(
            (question) =>
              getPaperQuestionSectionNumber(
                material.type,
                question.questionType,
              ) >= 8,
          ).length,
        0,
      );
      const listeningSectionRows = Array.from(
        lessonMaterials
          .reduce<
            Map<
              string,
              {
                key: string;
                label: string;
                sectionNumber: number | null;
                questionCount: number;
                materialIds: Set<string>;
              }
            >
          >((acc, material) => {
            const payload = decodeMaterialPayloadRecord(
              material.type,
              material.contentPayload,
            );
            const metadata = readJsonRecord(material.metadata);
            const questionRows =
              material.questions.length > 0
                ? material.questions
                : [{ content: {} }];
            for (const question of questionRows) {
              const section = resolveListeningSection({
                content: decodeQuestionContent(question.content),
                payload,
                metadata,
                chapterName: material.chapterName,
              });
              const current = acc.get(section.key) || {
                key: section.key,
                label: section.partNumber
                  ? section.title && section.title !== "听力"
                    ? `問題${section.partNumber}｜${section.title}`
                    : `問題${section.partNumber}`
                  : section.title,
                sectionNumber: section.partNumber,
                questionCount: 0,
                materialIds: new Set<string>(),
              };
              current.questionCount += "id" in question ? 1 : 0;
              current.materialIds.add(material.id);
              acc.set(section.key, current);
            }
            return acc;
          }, new Map())
          .values(),
      ).sort((a, b) => {
        const aNumber = a.sectionNumber || Number.MAX_SAFE_INTEGER;
        const bNumber = b.sectionNumber || Number.MAX_SAFE_INTEGER;
        if (aNumber !== bNumber) return aNumber - bNumber;
        return a.label.localeCompare(b.label, "zh-CN");
      });
      const manageSections: ExamHubManageSection[] = [
        ...(quizQuestionCount > 0 || quizMaterials.length > 0
          ? [
              {
                key: "VOCAB_GRAMMAR",
                label: "語彙・文法",
                detail: `${quizQuestionCount} 题 / ${quizMaterials.length} 模块`,
                materialType: MaterialType.VOCAB_GRAMMAR,
                questionCount: quizQuestionCount,
                materialCount: quizMaterials.length,
                sectionNumber: null,
              },
            ]
          : []),
        ...listeningSectionRows.map((section) => ({
          key: `LISTENING:${section.key}`,
          label: section.label,
          detail: `${section.questionCount} 题 / ${section.materialIds.size} 音频`,
          materialType: MaterialType.LISTENING,
          questionCount: section.questionCount,
          materialCount: section.materialIds.size,
          sectionNumber: section.sectionNumber,
        })),
        ...(readingQuestionCount > 0 || readingMaterials.length > 0
          ? [
              {
                key: "READING",
                label: "読解",
                detail: `${readingQuestionCount} 题 / ${readingMaterials.length} 篇`,
                materialType: MaterialType.READING,
                questionCount: readingQuestionCount,
                materialCount: readingMaterials.length,
                sectionNumber: null,
              },
            ]
          : []),
      ];

      const questionCount =
        lessonQuestionCount + quizQuestionCount + readingQuestionCount;
      const moduleCount =
        lessonMaterials.length + readingMaterials.length + quizMaterials.length;
      const allQuestions = materials.flatMap((item) => item.questions || []);
      const attemptCount = allQuestions.reduce(
        (sum, question) => sum + (question.attempts?.length || 0),
        0,
      );
      const attemptCorrectCount = allQuestions.reduce(
        (sum, question) =>
          sum +
          (question.attempts?.filter((attempt) => attempt.isCorrect).length ||
            0),
        0,
      );
      const attemptAccuracyPct =
        attemptCount > 0
          ? Math.round((attemptCorrectCount / attemptCount) * 100)
          : null;

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
        passageCount: readingMaterials.length,
        lessonCount: lessonMaterials.length,
        quizCount: quizMaterials.length,
        moduleCount,
        questionCount,
        lessonQuestionCount,
        listeningSectionCount: listeningSectionKeys.size,
        quizQuestionCount,
        textVocabularyQuestionCount,
        grammarQuestionCount,
        readingQuestionCount: readingComprehensionQuestionCount,
        completedPracticeCount: collection._count.practiceSubmissions,
        latestPracticeScore:
          collection.practiceSubmissions[0]?.totalScore ?? null,
        latestPracticePassed:
          collection.practiceSubmissions[0]?.passed ?? null,
        attemptCount,
        attemptCorrectCount,
        attemptAccuracyPct,
        manageSections,
      };
    })
    .filter((item) => item.questionCount > 0 || item.moduleCount > 0);

  if (papers.length === 0) return [];

  const grouped = new Map<string, ExamHubPaperSummary[]>();
  for (const paper of papers) {
    const key = paper.collectionType;
    const bucket = grouped.get(key) || [];
    bucket.push(paper);
    grouped.set(key, bucket);
  }

  const levels: ExamHubLevelSummary[] = [];
  const order: Array<{ type: CollectionType; title: string }> = [
    { type: CollectionType.PAPER, title: "试卷" },
    { type: CollectionType.CUSTOM_GROUP, title: "分组" },
  ];
  for (const item of order) {
    const rows = grouped.get(item.type) || [];
    if (rows.length === 0) continue;
    levels.push({
      id: `collectionType-${item.type}`,
      title: item.title,
      papers: rows,
    });
  }

  return levels;
}

export async function getPracticePerformanceGroups(): Promise<
  PracticePerformanceGroup[]
> {
  const userId = await getCurrentUserId();
  const attempts = await prisma.questionAttempt.findMany({
    where: { userId },
    select: {
      isCorrect: true,
      timeSpentMs: true,
      question: {
        select: {
          questionType: true,
          content: true,
          material: {
            select: {
              type: true,
              chapterName: true,
              contentPayload: true,
              metadata: true,
              collectionMaterials: {
                where: {
                  collection: { collectionType: CollectionType.PAPER },
                },
                select: {
                  collection: {
                    select: {
                      language: true,
                      level: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  type MutableStat = {
    key: string;
    category: string;
    sectionNumber: number;
    label: string;
    attemptCount: number;
    correctCount: number;
    timedAttemptCount: number;
    totalTimeMs: number;
  };
  type MutableGroup = {
    language: string;
    level: string;
    attemptCount: number;
    correctCount: number;
    timedAttemptCount: number;
    totalTimeMs: number;
    questionTypes: Map<string, MutableStat>;
  };

  const groups = new Map<string, MutableGroup>();
  for (const attempt of attempts) {
    const question = attempt.question;
    const material = question.material;
    const collectionGroups = new Map<string, { language: string; level: string }>();
    for (const relation of material.collectionMaterials) {
      const language = (relation.collection.language || "未设置语言").trim();
      const normalizedLanguage = language.toLowerCase();
      const isEnglish =
        normalizedLanguage === "英语" ||
        normalizedLanguage === "english" ||
        normalizedLanguage === "en" ||
        normalizedLanguage.startsWith("en-");
      const level = isEnglish
        ? ""
        : (relation.collection.level || "未设置等级").trim();
      collectionGroups.set(`${language}\u0000${level}`, { language, level });
    }
    if (collectionGroups.size === 0) continue;

    let sectionNumber: number;
    let sectionTitle: string;
    let category: string;
    let categoryOrder: number;
    if (material.type === MaterialType.LISTENING) {
      const section = resolveListeningSection({
        content: decodeQuestionContent(question.content),
        payload: decodeMaterialPayloadRecord(
          material.type,
          material.contentPayload,
        ),
        metadata: readJsonRecord(material.metadata),
        chapterName: material.chapterName,
      });
      sectionNumber = section.partNumber || 1;
      sectionTitle = section.title || "聴解";
      category = "聴解";
      categoryOrder = 3;
    } else if (material.type === MaterialType.READING) {
      const section = getReadingQuestionSection(question.questionType);
      sectionNumber = section.sectionNumber;
      sectionTitle = section.title;
      category = sectionNumber === 7 ? "文法" : "読解";
      categoryOrder = sectionNumber === 7 ? 1 : 2;
    } else {
      const section = getVocabGrammarQuestionSection(question.questionType);
      sectionNumber = section.sectionNumber;
      sectionTitle = section.title;
      category = sectionNumber <= 4 ? "文字・語彙" : "文法";
      categoryOrder = sectionNumber <= 4 ? 0 : 1;
    }
    const statKey = `${categoryOrder}:${sectionNumber}:${sectionTitle}`;

    for (const [groupKey, collectionGroup] of collectionGroups) {
      const group = groups.get(groupKey) || {
        ...collectionGroup,
        attemptCount: 0,
        correctCount: 0,
        timedAttemptCount: 0,
        totalTimeMs: 0,
        questionTypes: new Map<string, MutableStat>(),
      };
      group.attemptCount += 1;
      group.correctCount += attempt.isCorrect ? 1 : 0;
      if (attempt.timeSpentMs > 0) {
        group.timedAttemptCount += 1;
        group.totalTimeMs += attempt.timeSpentMs;
      }

      const stat = group.questionTypes.get(statKey) || {
        key: statKey,
        category,
        sectionNumber,
        label: `問題${sectionNumber}｜${sectionTitle}`,
        attemptCount: 0,
        correctCount: 0,
        timedAttemptCount: 0,
        totalTimeMs: 0,
      };
      stat.attemptCount += 1;
      stat.correctCount += attempt.isCorrect ? 1 : 0;
      if (attempt.timeSpentMs > 0) {
        stat.timedAttemptCount += 1;
        stat.totalTimeMs += attempt.timeSpentMs;
      }
      group.questionTypes.set(statKey, stat);
      groups.set(groupKey, group);
    }
  }

  return Array.from(groups.entries())
    .map(([key, group]) => ({
      key,
      language: group.language,
      level: group.level,
      attemptCount: group.attemptCount,
      correctCount: group.correctCount,
      accuracyPct: Math.round((group.correctCount / group.attemptCount) * 100),
      averageTimeMs:
        group.timedAttemptCount > 0
          ? Math.round(group.totalTimeMs / group.timedAttemptCount)
          : null,
      questionTypes: Array.from(group.questionTypes.values())
        .sort((left, right) => {
          const leftCategory = Number(left.key.split(":", 1)[0]) || 0;
          const rightCategory = Number(right.key.split(":", 1)[0]) || 0;
          return (
            leftCategory - rightCategory ||
            left.sectionNumber - right.sectionNumber ||
            left.label.localeCompare(right.label, "ja")
          );
        })
        .map((stat) => ({
          key: stat.key,
          category: stat.category,
          sectionNumber: stat.sectionNumber,
          label: stat.label,
          attemptCount: stat.attemptCount,
          correctCount: stat.correctCount,
          accuracyPct: Math.round(
            (stat.correctCount / stat.attemptCount) * 100,
          ),
          averageTimeMs:
            stat.timedAttemptCount > 0
              ? Math.round(stat.totalTimeMs / stat.timedAttemptCount)
              : null,
        })),
    }))
    .sort(
      (left, right) =>
        left.language.localeCompare(right.language, "zh-CN") ||
        left.level.localeCompare(right.level, "zh-CN"),
    );
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

function getQuestionGroupKey(question: {
  id: string;
  materialId: string;
  material: {
    type: MaterialType;
    contentPayload?: unknown;
  };
}) {
  if (
    question.material.type === MaterialType.LISTENING ||
    question.material.type === MaterialType.READING ||
    question.material.type === MaterialType.SPEAKING ||
    question.material.type === MaterialType.MEDIA_SUBTITLE
  ) {
    return `material:${question.materialId}`;
  }
  const payload = question.material.contentPayload;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    if (
      (typeof record.text === 'string' && record.text.trim()) ||
      (typeof record.audioFile === 'string' && record.audioFile.trim()) ||
      (typeof record.transcript === 'string' && record.transcript.trim())
    ) {
      return `material:${question.materialId}`;
    }
  }
  return `question:${question.id}`;
}

export async function getRandomExamQuestionIdsBySelections(
  selectionKeys: string[],
  requestedCount: number,
  filters?: RandomPracticeFilters,
) {
  const userId = await getCurrentUserId();
  const normalizedLanguage = (filters?.language || "").trim();
  const normalizedLevel = (filters?.level || "").trim();
  const scope = filters?.scope || "unattempted";
  const hasCollectionFilter = Boolean(normalizedLanguage || normalizedLevel);

  const selectedKeySet = new Set(selectionKeys);
  const selectedMaterialTypes = new Set<MaterialType>();
  for (const key of selectedKeySet) {
    if (key.startsWith("LISTENING:") || key === "MATERIAL:LISTENING") {
      selectedMaterialTypes.add(MaterialType.LISTENING);
    } else if (key === "MATERIAL:READING") {
      selectedMaterialTypes.add(MaterialType.READING);
    } else if (key === "MATERIAL:VOCAB_GRAMMAR") {
      selectedMaterialTypes.add(MaterialType.VOCAB_GRAMMAR);
    } else if (key.startsWith("LANGUAGE:")) {
      selectedMaterialTypes.add(MaterialType.VOCAB_GRAMMAR);
      selectedMaterialTypes.add(MaterialType.READING);
    }
  }

  const candidateRows = await prisma.question.findMany({
    where: {
      material: {
        type: { in: Array.from(selectedMaterialTypes) },
        ...(hasCollectionFilter
          ? {
              collectionMaterials: {
                some: {
                  collection: {
                    ...(normalizedLanguage
                      ? { language: normalizedLanguage }
                      : {}),
                    ...(normalizedLevel ? { level: normalizedLevel } : {}),
                  },
                },
              },
            }
          : {}),
      },
    },
    select: {
      id: true,
      materialId: true,
      questionType: true,
      sortOrder: true,
      createdAt: true,
      _count: { select: { attempts: { where: { userId } } } },
      material: {
        select: { type: true },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const materialRows = await prisma.material.findMany({
    where: { id: { in: Array.from(new Set(candidateRows.map(row => row.materialId))) } },
    select: { id: true, type: true, chapterName: true, contentPayload: true, metadata: true },
  });
  const materialById = new Map(materialRows.map(row => [row.id, row]));
  const needsListeningContent = Array.from(selectedKeySet).some(key => key.startsWith("LISTENING:"))
    && !selectedKeySet.has("MATERIAL:LISTENING");
  const firstListeningQuestionByMaterial = new Map<string, string>();
  if (needsListeningContent) {
    for (const row of candidateRows) {
      if (row.material.type === MaterialType.LISTENING && !firstListeningQuestionByMaterial.has(row.materialId)) {
        firstListeningQuestionByMaterial.set(row.materialId, row.id);
      }
    }
  }
  const firstListeningQuestionIds = Array.from(firstListeningQuestionByMaterial.values());
  const listeningContentRows = firstListeningQuestionIds.length
    ? await prisma.question.findMany({
        where: { id: { in: firstListeningQuestionIds } },
        select: { id: true, content: true },
      })
    : [];
  const listeningContentById = new Map(listeningContentRows.map(row => [row.id, row.content]));

  const groupsMap = new Map<
    string,
    {
      groupKey: string;
      material: (typeof materialRows)[number];
      questions: typeof candidateRows;
    }
  >();

  for (const question of candidateRows) {
    const material = materialById.get(question.materialId);
    if (!material) continue;
    const groupKey = getQuestionGroupKey({ ...question, material });
    const existing = groupsMap.get(groupKey);
    if (existing) {
      existing.questions.push(question);
    } else {
      groupsMap.set(groupKey, {
        groupKey,
        material,
        questions: [question],
      });
    }
  }

  const matchingGroups = Array.from(groupsMap.values()).filter((group) => {
    const materialType = group.material.type;
    const firstQ = group.questions[0];
    let matchesSelection = false;

    if (selectedKeySet.has(`MATERIAL:${materialType}`)) {
      matchesSelection = true;
    } else if (materialType === MaterialType.LISTENING) {
      const section = resolveListeningSection({
        content: decodeQuestionContent(listeningContentById.get(firstQ.id)),
        payload: decodeMaterialPayloadRecord(
          materialType,
          group.material.contentPayload,
        ),
        metadata: readJsonRecord(group.material.metadata),
        chapterName: group.material.chapterName,
      });
      matchesSelection = selectedKeySet.has(
        `LISTENING:${section.partNumber || 1}`,
      );
    } else {
      const sectionNumber = getPaperQuestionSectionNumber(
        materialType,
        firstQ.questionType,
      );
      matchesSelection = selectedKeySet.has(`LANGUAGE:${sectionNumber}`);
    }

    if (!matchesSelection) return false;

    if (scope === "unattempted") {
      return group.questions.every((q) => q._count.attempts === 0);
    }
    if (scope === "attempted") {
      return group.questions.some((q) => q._count.attempts > 0);
    }
    return true;
  });

  const selectedGroups = shuffleList(matchingGroups).slice(
    0,
    Math.max(0, Math.floor(requestedCount)),
  );

  return selectedGroups.flatMap((group) => group.questions.map((q) => q.id));
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
