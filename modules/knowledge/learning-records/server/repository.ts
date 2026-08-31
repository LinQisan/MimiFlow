import 'server-only'

import { LearningRecordKind, SourceType } from '@prisma/client'

import prisma from '@/lib/prisma'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import { parseAudioDialogueSourceId } from '@/utils/audioDialogue/sourceId'

type LearningRecordSource = {
  sourceType: SourceType
  sourceId: string
}

function getMaterialId(source: LearningRecordSource) {
  if (
    source.sourceType !== SourceType.AUDIO_DIALOGUE &&
    source.sourceType !== SourceType.MEDIA_SUBTITLE_LINE
  ) {
    return null
  }

  return parseAudioDialogueSourceId(source.sourceId)?.materialId || null
}

async function resolveSourceHrefs(records: LearningRecordSource[]) {
  const questionIds = records
    .filter(record => record.sourceType === SourceType.QUIZ_QUESTION)
    .map(record => record.sourceId)

  const questions = questionIds.length
    ? await prisma.question.findMany({
        where: { id: { in: questionIds } },
        select: {
          id: true,
          material: {
            select: {
              collectionMaterials: {
                where: { collection: { collectionType: 'PAPER' } },
                orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                take: 1,
                select: { collectionId: true },
              },
            },
          },
        },
      })
    : []
  const questionPaperIds = new Map(
    questions.flatMap(question => {
      const paperId = question.material.collectionMaterials[0]?.collectionId
      return paperId ? [[question.id, paperId] as const] : []
    }),
  )

  return records.map(record => {
    const encodedSourceId = encodeURIComponent(record.sourceId)

    if (record.sourceType === SourceType.ARTICLE_TEXT) {
      return `/reading/articles/${encodedSourceId}`
    }

    if (record.sourceType === SourceType.QUIZ_QUESTION) {
      const paperId = questionPaperIds.get(record.sourceId)
      return paperId
        ? `/practice/${encodeURIComponent(paperId)}/do?qid=${encodedSourceId}`
        : null
    }

    const materialId = getMaterialId(record)
    if (!materialId) return null

    const basePath =
      record.sourceType === SourceType.MEDIA_SUBTITLE_LINE
        ? '/subtitles'
        : '/listening'
    return `${basePath}/${encodeURIComponent(materialId)}`
  })
}

export async function listLearningRecords(kind?: LearningRecordKind) {
  const userId = await getCurrentUserId()
  const records = await prisma.learningRecord.findMany({
    where: { userId, ...(kind ? { kind } : {}) },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
  })
  const sourceHrefs = await resolveSourceHrefs(records)

  return records.map((record, index) => ({
    ...record,
    sourceHref: sourceHrefs[index],
  }))
}
