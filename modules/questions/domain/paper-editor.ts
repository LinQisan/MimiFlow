export const MATERIAL_GROUPS = [
  {
    key: "VOCAB_GRAMMAR",
    title: "語彙・文法",
  },
  {
    key: "READING",
    title: "読解",
  },
  {
    key: "LISTENING",
    title: "聴解",
  },
] as const;

const PAPER_LANGUAGE_GROUPS = [
  { key: "TEXT_VOCAB", title: "文字・語彙", sectionFrom: 1, sectionTo: 4 },
  { key: "GRAMMAR", title: "文法", sectionFrom: 5, sectionTo: 7 },
] as const;

export const PAPER_LISTENING_SECTIONS = [
  { sectionNumber: 1, title: "課題理解" },
  { sectionNumber: 2, title: "ポイント理解" },
  { sectionNumber: 3, title: "概要理解" },
  { sectionNumber: 4, title: "即時応答" },
  { sectionNumber: 5, title: "統合理解" },
] as const;

export function getPaperLanguageSectionGroup(sectionNumber: number) {
  return (
    PAPER_LANGUAGE_GROUPS.find(
      (group) =>
        sectionNumber >= group.sectionFrom && sectionNumber <= group.sectionTo,
    ) || PAPER_LANGUAGE_GROUPS[1]
  );
}

const VOCAB_GRAMMAR_SECTION_BY_TYPE: Record<
  string,
  { sectionNumber: number; title: string }
> = {
  PRONUNCIATION: { sectionNumber: 1, title: "漢字読み" },
  GRAMMAR: { sectionNumber: 2, title: "文脈規定" },
  SYNONYM_REPLACEMENT: { sectionNumber: 3, title: "言い換え類義" },
  WORD_DISTINCTION: { sectionNumber: 4, title: "用法" },
  GRAMMAR_SELECTION: { sectionNumber: 5, title: "文の文法1" },
  TOEIC_INCOMPLETE_SENTENCES: {
    sectionNumber: 5,
    title: "Incomplete Sentences",
  },
  SORTING: { sectionNumber: 6, title: "文の文法2" },
  FILL_BLANK: { sectionNumber: 7, title: "文章の文法" },
};

export type PaperReadingQuestionType =
  | "FILL_BLANK"
  | "READING_SHORT"
  | "READING_MEDIUM"
  | "READING_LONG"
  | "READING_INTEGRATED"
  | "READING_ARGUMENT"
  | "READING_INFORMATION"
  | "TOEIC_TEXT_COMPLETION"
  | "TOEIC_READING_COMPREHENSION";

export const PAPER_READING_QUESTION_TYPES: ReadonlyArray<{
  value: PaperReadingQuestionType;
  sectionNumber: number;
  title: string;
}> = [
  { value: "FILL_BLANK", sectionNumber: 7, title: "文章の文法" },
  { value: "READING_SHORT", sectionNumber: 8, title: "内容理解（短文）" },
  { value: "READING_MEDIUM", sectionNumber: 9, title: "内容理解（中文）" },
  { value: "READING_LONG", sectionNumber: 10, title: "内容理解（長文）" },
  { value: "READING_INTEGRATED", sectionNumber: 11, title: "統合理解" },
  { value: "READING_ARGUMENT", sectionNumber: 12, title: "主張理解（長文）" },
  { value: "READING_INFORMATION", sectionNumber: 13, title: "情報検索" },
  { value: "TOEIC_TEXT_COMPLETION", sectionNumber: 6, title: "Text Completion" },
  {
    value: "TOEIC_READING_COMPREHENSION",
    sectionNumber: 7,
    title: "Reading Comprehension",
  },
];

const READING_SECTION_BY_TYPE: Record<
  string,
  { sectionNumber: number; title: string }
> = {
  FILL_BLANK: { sectionNumber: 7, title: "文章の文法" },
  READING_COMPREHENSION: { sectionNumber: 8, title: "内容理解" },
  TOEIC_TEXT_COMPLETION: { sectionNumber: 6, title: "Text Completion" },
  TOEIC_READING_COMPREHENSION: {
    sectionNumber: 7,
    title: "Reading Comprehension",
  },
  ...Object.fromEntries(
    PAPER_READING_QUESTION_TYPES.map(({ value, sectionNumber, title }) => [
      value,
      { sectionNumber, title },
    ]),
  ),
};

export function getVocabGrammarQuestionSection(questionType: string) {
  return (
    VOCAB_GRAMMAR_SECTION_BY_TYPE[questionType] || {
      sectionNumber: 9,
      title: questionType || "問題",
    }
  );
}

export function getReadingQuestionSection(questionType: string) {
  return (
    READING_SECTION_BY_TYPE[questionType] || {
      sectionNumber: 8,
      title: questionType || "内容理解",
    }
  );
}

export function getPaperReadingMaterialTitle(questionType: string) {
  const section = getReadingQuestionSection(questionType);
  if (questionType === "TOEIC_TEXT_COMPLETION") {
    return "Part 6 · Text Completion";
  }
  if (questionType === "TOEIC_READING_COMPREHENSION") {
    return "Part 7 · Reading Comprehension";
  }
  return `問題${section.sectionNumber}｜${section.title}`;
}

export function isReadingGrammarQuestion(questionType: string) {
  return questionType === "FILL_BLANK";
}

export function getPaperQuestionSectionNumber(
  materialType: string,
  questionType: string,
) {
  if (materialType === "VOCAB_GRAMMAR") {
    return getVocabGrammarQuestionSection(questionType).sectionNumber;
  }
  if (materialType === "READING") {
    return getReadingQuestionSection(questionType).sectionNumber;
  }
  return Number.MAX_SAFE_INTEGER;
}

export function parseActiveQuestionSection(sectionKey?: string | null) {
  if (!sectionKey) return null;
  if (sectionKey === "READING" || sectionKey === "VOCAB_GRAMMAR") {
    return { materialType: sectionKey, listeningSectionKey: null };
  }
  if (sectionKey.startsWith("LISTENING:")) {
    return {
      materialType: "LISTENING",
      listeningSectionKey: sectionKey.slice("LISTENING:".length),
    };
  }
  if (sectionKey === "LISTENING") {
    return { materialType: "LISTENING", listeningSectionKey: null };
  }
  return null;
}
