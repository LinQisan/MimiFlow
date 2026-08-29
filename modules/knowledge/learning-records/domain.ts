import {
  LearningPointCategory,
  LearningRecordKind,
  SourceType,
} from '@prisma/client'

export const LEARNING_RECORD_KIND_LABELS: Record<LearningRecordKind, string> = {
  [LearningRecordKind.LEARNING_POINT]: '学习点',
  [LearningRecordKind.SENTENCE]: '句子',
}

export const LEARNING_POINT_CATEGORY_LABELS: Record<
  LearningPointCategory,
  string
> = {
  [LearningPointCategory.GRAMMAR]: '语法',
  [LearningPointCategory.PATTERN]: '句型',
  [LearningPointCategory.PARAPHRASE]: '言い換え',
  [LearningPointCategory.DISTRACTOR]: '干扰项辨析',
  [LearningPointCategory.OTHER]: '其他',
}

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  [SourceType.AUDIO_DIALOGUE]: '听力',
  [SourceType.MEDIA_SUBTITLE_LINE]: '字幕',
  [SourceType.ARTICLE_TEXT]: '文章',
  [SourceType.QUIZ_QUESTION]: '题目',
}

export function normalizeLearningFragments(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map(item => item.replace(/\s+/g, ' ').trim())
        .filter(Boolean),
    ),
  )
}
