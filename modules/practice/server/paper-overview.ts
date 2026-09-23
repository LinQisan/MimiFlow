import 'server-only'

import { CollectionType, MaterialType } from '@prisma/client'
import prisma from '@/lib/prisma'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import { decodeMaterialPayloadRecord } from '@/lib/codecs/material-payload'
import { decodeQuestionContent } from '@/lib/codecs/question-content'
import { readJsonRecord } from '@/lib/validation/schema'
import { getPaperQuestionSectionNumber, getReadingQuestionSection, getVocabGrammarQuestionSection } from '@/modules/questions/domain/paper-editor'
import { resolveListeningSection } from '@/modules/practice/domain/listening-section'

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

