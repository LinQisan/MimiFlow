import {
  getReadingQuestionSection,
  getPaperLanguageSectionGroup,
  getVocabGrammarQuestionSection,
} from "../../questions/domain/paper-editor.ts";
import { getToeicPartByQuestionType } from "../../questions/domain/toeic.ts";
import { buildPracticeQuestionNumberMap } from "./question-numbering.ts";

export type AnswerCardQuestion = {
  id: string;
  questionType?: string | null;
  passageId?: string | null;
  lessonId?: string | null;
  lesson?: {
    sectionNumber?: number | null;
    sectionTitle?: string | null;
  } | null;
};

type AnswerCardItem = {
  question: AnswerCardQuestion;
  questionIndex: number;
  localNumber: number;
};

export type AnswerCardSection = {
  key: string;
  materialKey: "TEXT_VOCAB" | "GRAMMAR" | "READING" | "LISTENING";
  materialTitle: string;
  sectionNumber: number;
  sectionTitle: string;
  items: AnswerCardItem[];
};

const MATERIAL_ORDER = {
  TEXT_VOCAB: 0,
  GRAMMAR: 1,
  READING: 2,
  LISTENING: 3,
} as const;

const isEnglishLanguage = (language?: string | null) => {
  const normalized = (language || "").trim().toLowerCase();
  return normalized === "en" || normalized.startsWith("en-");
};

const getQuestionSection = (
  question: AnswerCardQuestion,
  paperLanguage?: string | null,
) => {
  const questionType = question.questionType || "";
  const toeicPart = getToeicPartByQuestionType(questionType);
  const isEnglish = isEnglishLanguage(paperLanguage);

  if (toeicPart) {
    const isListeningPart = toeicPart.materialType === "LISTENING";
    return {
      materialKey: isListeningPart ? ("LISTENING" as const) : ("READING" as const),
      materialTitle: isEnglish
        ? isListeningPart
          ? "Listening"
          : "Reading"
        : "TOEIC",
      sectionNumber: toeicPart.part,
      sectionTitle: `Part ${toeicPart.part} · ${toeicPart.title}`,
    };
  }

  if (question.lessonId) {
    return {
      materialKey: "LISTENING" as const,
      materialTitle: isEnglish ? "Listening" : "聴解",
      sectionNumber: question.lesson?.sectionNumber || 1,
      sectionTitle: question.lesson?.sectionTitle || "聴解",
    };
  }

  if (question.passageId && questionType !== "FILL_BLANK") {
    const section = getReadingQuestionSection(questionType);
    return {
      materialKey: "READING" as const,
      materialTitle: "読解",
      sectionNumber: section.sectionNumber,
      sectionTitle: section.title,
    };
  }

  const section = question.passageId
    ? getReadingQuestionSection(questionType)
    : getVocabGrammarQuestionSection(questionType);
  const languageGroup = getPaperLanguageSectionGroup(section.sectionNumber);
  return {
    materialKey: languageGroup.key,
    materialTitle: languageGroup.title,
    sectionNumber: section.sectionNumber,
    sectionTitle: section.title,
  };
};

export function buildAnswerCardSections(
  questions: AnswerCardQuestion[],
  paperLanguage?: string | null,
): AnswerCardSection[] {
  const sections = new Map<string, AnswerCardSection>();

  questions.forEach((question, questionIndex) => {
    const section = getQuestionSection(question, paperLanguage);
    const key = `${section.materialKey}:${section.sectionNumber}`;
    const current = sections.get(key);
    const item = {
      question,
      questionIndex,
      localNumber: (current?.items.length || 0) + 1,
    };

    if (current) {
      current.items.push(item);
      return;
    }

    sections.set(key, {
      key,
      ...section,
      items: [item],
    });
  });

  const orderedSections = [...sections.values()].sort(
    (a, b) =>
      MATERIAL_ORDER[a.materialKey] - MATERIAL_ORDER[b.materialKey] ||
      a.sectionNumber - b.sectionNumber,
  );
  const numberMap = buildPracticeQuestionNumberMap(
    orderedSections.flatMap(section =>
      section.items.map(item => ({
        id: item.question.id,
        isListening: section.materialKey === "LISTENING",
        sectionKey: section.key,
      })),
    ),
    paperLanguage,
  );
  orderedSections.forEach(section => {
    section.items.forEach(item => {
      item.localNumber = numberMap.get(item.question.id) || item.localNumber;
    });
  });

  return orderedSections;
}
