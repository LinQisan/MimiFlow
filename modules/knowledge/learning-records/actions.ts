'use server'

import {
  LearningPointCategory,
  LearningRecordKind,
  SourceType,
} from '@prisma/client'
import { revalidatePath } from 'next/cache'

import prisma from '@/lib/prisma'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import { normalizeLearningFragments } from './domain'

export type SaveLearningRecordInput = {
  kind: LearningRecordKind
  category?: LearningPointCategory | null
  title: string
  fragments: string[]
  sentenceText: string
  note?: string
  sourceType: SourceType
  sourceId: string
}

const isEnumValue = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && values.includes(value as T)

export async function saveLearningRecord(input: SaveLearningRecordInput) {
  try {
    const userId = await getCurrentUserId()
    const kindValues = Object.values(LearningRecordKind)
    const categoryValues = Object.values(LearningPointCategory)
    const sourceTypeValues = Object.values(SourceType)

    if (!isEnumValue(kindValues, input.kind)) {
      return { success: false, message: '记录类型无效。' }
    }
    if (!isEnumValue(sourceTypeValues, input.sourceType)) {
      return { success: false, message: '来源无效。' }
    }

    const sentenceText = input.sentenceText.replace(/\s+/g, ' ').trim()
    const sourceId = input.sourceId.trim()
    const fragments = normalizeLearningFragments(input.fragments).slice(0, 8)
    const title = input.title.replace(/\s+/g, ' ').trim()
    const note = (input.note || '').trim()
    const category =
      input.kind === LearningRecordKind.LEARNING_POINT &&
      isEnumValue(categoryValues, input.category)
        ? input.category
        : null

    if (!sourceId || !sentenceText) {
      return { success: false, message: '缺少原句或来源，无法保存。' }
    }
    if (sentenceText.length > 2000) {
      return { success: false, message: '原句过长，请缩短后重试。' }
    }
    if (input.kind === LearningRecordKind.LEARNING_POINT && fragments.length === 0) {
      return { success: false, message: '请至少填写一个句内片段。' }
    }

    const normalizedTitle =
      title ||
      (input.kind === LearningRecordKind.SENTENCE
        ? sentenceText.slice(0, 80)
        : fragments.join(' / ').slice(0, 80))

    const created = await prisma.learningRecord.create({
      data: {
        userId,
        kind: input.kind,
        category,
        title: normalizedTitle.slice(0, 200),
        fragments,
        sentenceText,
        note: note ? note.slice(0, 10000) : null,
        sourceType: input.sourceType,
        sourceId,
      },
      select: { id: true },
    })

    revalidatePath('/learning-points')
    return { success: true, id: created.id, message: '已保存到学习点。' }
  } catch (error) {
    console.error('保存学习记录失败:', error)
    return { success: false, message: '保存失败，请重试。' }
  }
}
