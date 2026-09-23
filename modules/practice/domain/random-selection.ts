import { MaterialType } from '@prisma/client'

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


export function getQuestionGroupKey(question: {
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

