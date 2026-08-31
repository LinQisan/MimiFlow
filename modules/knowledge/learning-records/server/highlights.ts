import 'server-only'

import { LearningRecordKind, SourceType } from '@prisma/client'

import prisma from '@/lib/prisma'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import { normalizeLearningFragments } from '@/modules/knowledge/learning-records/domain'

export type LearningPointHighlightSource = {
  sourceType: SourceType
  sourceId: string
}

export async function listLearningPointHighlights(
  sources: LearningPointHighlightSource[],
) {
  if (sources.length === 0) return []
  const userId = await getCurrentUserId()
  const records = await prisma.learningRecord.findMany({
    where: {
      userId,
      kind: LearningRecordKind.LEARNING_POINT,
      OR: sources.map(source => ({
        sourceType: source.sourceType,
        sourceId: source.sourceId,
      })),
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      title: true,
      category: true,
      fragments: true,
      note: true,
      sentenceText: true,
      sourceType: true,
      sourceId: true,
    },
  })

  return records.map(record => ({
    ...record,
    fragments: normalizeLearningFragments(record.fragments),
  }))
}
