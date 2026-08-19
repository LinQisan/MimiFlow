import {
  CollectionType,
  MaterialType,
  Prisma,
  SourceType,
} from '@prisma/client'

import prisma from '@/lib/prisma'
import { parseJsonStringList, toJsonStringList } from '@/utils/text/jsonList'
import { buildVocabularyCanonicalKeys } from '@/utils/vocabulary/vocabularyCanonical'
import { dedupeAndRankSentences } from '@/utils/vocabulary/sentenceQuality'
import {
  findAudioDialogueTiming,
  parseAudioDialogueSourceId,
} from '@/utils/audioDialogue/sourceId'
import { decodeMaterialPayload } from '@/lib/codecs/material-payload'
import { getReadingCardTitle } from '@/lib/repositories/materials/material-title'

const VOCABULARY_DETAIL_INCLUDE = {
  wordbooks: {
    orderBy: { createdAt: 'asc' },
    include: { wordbook: { select: { id: true, title: true } } },
  },
  tags: { include: { tag: { select: { name: true } } } },
  review: {
    select: {
      id: true,
      due: true,
      state: true,
      stability: true,
      difficulty: true,
      elapsed_days: true,
      scheduled_days: true,
      reps: true,
      lapses: true,
      learning_steps: true,
      last_review: true,
    },
  },
} satisfies Prisma.VocabularyInclude

export type VocabularyDetailRow = Prisma.VocabularyGetPayload<{
  include: typeof VOCABULARY_DETAIL_INCLUDE
}>

export function listVocabularyGroups(where: Prisma.VocabularyWhereInput) {
  return prisma.vocabulary.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      word: true,
      pronunciations: true,
      sourceType: true,
    },
  })
}

export function listVocabularyDetails(ids: string[]) {
  if (ids.length === 0) return Promise.resolve([] as VocabularyDetailRow[])
  return prisma.vocabulary.findMany({
    where: { id: { in: ids } },
    include: VOCABULARY_DETAIL_INCLUDE,
  })
}

export function findVocabularyDetail(id: string) {
  return prisma.vocabulary.findUnique({
    where: { id },
    include: VOCABULARY_DETAIL_INCLUDE,
  })
}

export function listVocabularySentenceLinks(vocabularyIds: string[]) {
  if (vocabularyIds.length === 0) return Promise.resolve([])
  return prisma.vocabularySentenceLink.findMany({
    where: { vocabularyId: { in: vocabularyIds } },
    include: { sentence: true },
    orderBy: { createdAt: 'asc' },
  })
}

export type VocabularySentenceAudioClip = {
  audioFile: string
  start: number
  end: number
}

export async function resolveAudioDialogueClips(sourceIds: string[]) {
  const parsedSources = Array.from(new Set(sourceIds))
    .map(sourceId => ({ sourceId, parsed: parseAudioDialogueSourceId(sourceId) }))
    .filter(
      (item): item is {
        sourceId: string
        parsed: { materialId: string; stableId: string }
      } => Boolean(item.parsed),
    )
  if (parsedSources.length === 0) {
    return {} as Record<string, VocabularySentenceAudioClip>
  }

  const materials = await prisma.material.findMany({
    where: {
      id: { in: Array.from(new Set(parsedSources.map(item => item.parsed.materialId))) },
      type: { in: [MaterialType.LISTENING, MaterialType.SPEAKING] },
    },
    select: { id: true, type: true, contentPayload: true },
  })
  const materialMap = new Map(materials.map(material => [material.id, material]))
  const result: Record<string, VocabularySentenceAudioClip> = {}

  parsedSources.forEach(({ sourceId, parsed }) => {
    const material = materialMap.get(parsed.materialId)
    if (!material) return
    if (
      material.type !== MaterialType.LISTENING &&
      material.type !== MaterialType.SPEAKING
    ) {
      return
    }
    const payload = decodeMaterialPayload(material.type, material.contentPayload)
    const audioFile = (payload.audioFile || payload.audioUrl || '').trim()
    if (!audioFile) return
    const timing = findAudioDialogueTiming(payload.dialogues, parsed.stableId)
    if (!timing) return
    result[sourceId] = {
      audioFile,
      start: timing.start,
      end: timing.end,
    }
  })

  return result
}

export async function resolveAudioDialogueSentenceText(sourceId: string) {
  const parsed = parseAudioDialogueSourceId(sourceId)
  if (!parsed) return ''

  const material = await prisma.material.findUnique({
    where: { id: parsed.materialId },
    select: { type: true, contentPayload: true },
  })
  if (
    !material ||
    (material.type !== MaterialType.LISTENING &&
      material.type !== MaterialType.SPEAKING)
  ) {
    return ''
  }

  const payload = decodeMaterialPayload(material.type, material.contentPayload)
  const dialogue = payload.dialogues.find(item =>
    [item.stableId, item.sequenceId, item.id]
      .map(value => String(value ?? '').trim())
      .filter(Boolean)
      .includes(parsed.stableId),
  )
  return dialogue?.text.trim() || ''
}

export type ResolvedVocabularySentenceSource = {
  source: string
  sourceUrl: string
}

const sentenceSourceKey = (
  sourceType?: SourceType | null,
  sourceId?: string | null,
) => `${sourceType || ''}:${(sourceId || '').trim()}`

export async function resolveVocabularySentenceSources(
  references: Array<{
    sourceType?: SourceType | null
    sourceId?: string | null
  }>,
) {
  const normalized = references.filter(
    reference => reference.sourceType && reference.sourceId?.trim(),
  )
  const questionIds = Array.from(
    new Set(
      normalized
        .filter(reference => reference.sourceType === SourceType.QUIZ_QUESTION)
        .map(reference => reference.sourceId!.trim()),
    ),
  )
  const parsedMaterialReferences = normalized
    .filter(reference => reference.sourceType !== SourceType.QUIZ_QUESTION)
    .map(reference => ({
      ...reference,
      parsed:
        reference.sourceType === SourceType.ARTICLE_TEXT
          ? {
              materialId: reference.sourceId!.trim(),
              stableId: '',
            }
          : parseAudioDialogueSourceId(reference.sourceId!),
    }))
    .filter(
      (reference): reference is typeof reference & {
        parsed: { materialId: string; stableId: string }
      } => Boolean(reference.parsed),
    )

  const questions = questionIds.length
    ? await prisma.question.findMany({
        where: { id: { in: questionIds } },
        select: { id: true, materialId: true },
      })
    : []
  const materialIds = Array.from(
    new Set([
      ...parsedMaterialReferences.map(reference => reference.parsed.materialId),
      ...questions.map(question => question.materialId),
    ]),
  )
  if (materialIds.length === 0) {
    return {} as Record<string, ResolvedVocabularySentenceSource>
  }

  const materials = await prisma.material.findMany({
    where: { id: { in: materialIds } },
    select: {
      id: true,
      type: true,
      title: true,
      contentPayload: true,
      collectionMaterials: {
        orderBy: { sortOrder: 'asc' },
        select: {
          collection: {
            select: { id: true, title: true, collectionType: true },
          },
        },
      },
    },
  })
  const materialMap = new Map(materials.map(material => [material.id, material]))
  const result: Record<string, ResolvedVocabularySentenceSource> = {}

  const materialSource = (materialId: string) => {
    const material = materialMap.get(materialId)
    if (!material) return null
    const paper = material.collectionMaterials.find(
      item => item.collection.collectionType === CollectionType.PAPER,
    )?.collection
    const paperTitle = paper?.title.trim() || ''

    if (material.type === MaterialType.LISTENING) {
      return {
        source: `听力：${paperTitle || material.title}`,
        sourceUrl: `/listening/${material.id}`,
      }
    }
    if (material.type === MaterialType.SPEAKING) {
      return {
        source: `跟读：${material.title}`,
        sourceUrl: `/listening/${material.id}`,
      }
    }
    if (material.type === MaterialType.READING) {
      return {
        source: `阅读：${paperTitle || getReadingCardTitle(material.title)}`,
        sourceUrl: `/reading/articles/${material.id}`,
      }
    }
    if (material.type === MaterialType.MEDIA_SUBTITLE) {
      const payload = decodeMaterialPayload(
        MaterialType.MEDIA_SUBTITLE,
        material.contentPayload,
      )
      const workTitle = payload.subtitleWorkTitle.trim() || material.title
      const episode = [
        payload.subtitleSeason ? `S${payload.subtitleSeason}` : '',
        payload.subtitleEpisode ? `E${payload.subtitleEpisode}` : '',
      ]
        .filter(Boolean)
        .join('')
      return {
        source: `影视：${workTitle}${episode ? ` · ${episode}` : ''}`,
        sourceUrl: `/subtitles/${material.id}`,
      }
    }
    if (material.type === MaterialType.VOCAB_GRAMMAR) {
      return {
        source: `题目：${paperTitle || material.title}`,
        sourceUrl: paper ? `/practice/${paper.id}` : '/practice',
      }
    }
    return null
  }

  parsedMaterialReferences.forEach(reference => {
    const resolved = materialSource(reference.parsed.materialId)
    if (!resolved) return
    result[
      sentenceSourceKey(reference.sourceType, reference.sourceId)
    ] = resolved
  })
  questions.forEach(question => {
    const resolved = materialSource(question.materialId)
    if (!resolved) return
    result[sentenceSourceKey(SourceType.QUIZ_QUESTION, question.id)] = resolved
  })

  return result
}

export const normalizeSentencePosTags = (list?: string[] | null) =>
  Array.from(
    new Set((list || []).map(item => item.trim()).filter(Boolean)),
  ).slice(0, 1)

export type VocabularySentenceRecord = {
  text: string
  source: string
  sourceUrl: string
  translation?: string | null
  audioFile?: string | null
  sourceType?: SourceType | null
  meaningIndex?: number | null
  posTags?: string[] | null
}

const resolveMaterialId = async (
  type: MaterialType,
  id: string,
) => {
  const direct = await prisma.material.findUnique({
    where: { id },
    select: { id: true, type: true },
  })
  if (direct && direct.type === type) return direct.id
  return null
}

const scoreVocabularyCandidate = (
  normalizedWord: string,
  targetKeys: Set<string>,
  candidateWord: string,
) => {
  const candidateKeys = buildVocabularyCanonicalKeys(candidateWord)
  const intersectCount = candidateKeys.filter(key => targetKeys.has(key)).length
  if (intersectCount === 0) return -1

  const lengthScore = Math.max(
    0,
    6 - Math.abs(candidateWord.length - normalizedWord.length),
  )

  return intersectCount * 10 + lengthScore
}

const buildVocabularyCandidateTerms = (normalizedWord: string) =>
  Array.from(
    new Set(
      [normalizedWord, ...buildVocabularyCanonicalKeys(normalizedWord)]
        .map(item => item.trim())
        .filter(Boolean),
    ),
  )

export const findExistingVocabularyCandidate = async (normalizedWord: string) => {
  const targetKeys = new Set(buildVocabularyCanonicalKeys(normalizedWord))
  if (targetKeys.size === 0) return null

  const candidateTerms = buildVocabularyCandidateTerms(normalizedWord)
  const startsWithTerms = candidateTerms
    .filter(item => item.length >= 2)
    .slice(0, 8)

  const candidates = await prisma.vocabulary.findMany({
    where: {
      OR: [
        { word: normalizedWord },
        ...candidateTerms.map(term => ({ word: term })),
        ...startsWithTerms.map(term => ({
          word: { startsWith: term },
        })),
      ],
    },
    take: 80,
    orderBy: { createdAt: 'desc' },
  })

  let bestCandidate: (typeof candidates)[number] | null = null
  let bestScore = -1

  for (const candidate of candidates) {
    const score = scoreVocabularyCandidate(
      normalizedWord,
      targetKeys,
      candidate.word,
    )
    if (score < 0) continue
    if (!bestCandidate || score > bestScore) {
      bestCandidate = candidate
      bestScore = score
    }
  }

  return bestCandidate
}

const normalizeSentenceKey = (text: string) =>
  text
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/^[\s([{【（]*\d+[\]).】、．\s-]*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

export const upsertVocabularySentenceLink = async (
  vocabularyId: string,
  sentence: {
    text: string
    source: string
    sourceUrl: string
    translation?: string | null
    audioFile?: string | null
    sourceType?: SourceType
    sourceId?: string
    meaningIndex?: number | null
    posTags?: string[]
  },
) => {
  const text = sentence.text.trim()
  if (!text) return
  const sourceUrl = sentence.sourceUrl.trim() || '#'
  const normalizedText = normalizeSentenceKey(text)
  if (!normalizedText) return

  const sentenceRow = await prisma.vocabularySentence.upsert({
    where: {
      normalizedText_sourceUrl: {
        normalizedText,
        sourceUrl,
      },
    },
    update: {
      text,
      translation: (sentence.translation || '').trim() || null,
      audioFile: (sentence.audioFile || '').trim() || null,
      source: sentence.source.trim() || '未知来源',
      sourceType: sentence.sourceType,
      sourceId: sentence.sourceId || null,
    },
    create: {
      text,
      normalizedText,
      translation: (sentence.translation || '').trim() || null,
      audioFile: (sentence.audioFile || '').trim() || null,
      source: sentence.source.trim() || '未知来源',
      sourceUrl,
      sourceType: sentence.sourceType,
      sourceId: sentence.sourceId || null,
    },
  })

  await prisma.vocabularySentenceLink.upsert({
    where: {
      vocabularyId_sentenceId: {
        vocabularyId,
        sentenceId: sentenceRow.id,
      },
    },
    update: {
      meaningIndex:
        typeof sentence.meaningIndex === 'number'
          ? sentence.meaningIndex
          : null,
      posTags: toJsonStringList(normalizeSentencePosTags(sentence.posTags)),
    },
    create: {
      vocabularyId,
      sentenceId: sentenceRow.id,
      meaningIndex:
        typeof sentence.meaningIndex === 'number'
          ? sentence.meaningIndex
          : null,
      posTags: toJsonStringList(normalizeSentencePosTags(sentence.posTags)),
    },
  })
}

export const findSentenceLinkByText = async (
  vocabularyId: string,
  sentenceText: string,
) => {
  const normalized = normalizeSentenceKey(sentenceText)
  if (!normalized) return null
  return prisma.vocabularySentenceLink.findFirst({
    where: {
      vocabularyId,
      sentence: {
        normalizedText: normalized,
      },
    },
    include: {
      sentence: true,
    },
  })
}

export const cleanupOrphanSentence = async (sentenceId: string) => {
  const count = await prisma.vocabularySentenceLink.count({
    where: { sentenceId },
  })
  if (count === 0) {
    await prisma.vocabularySentence.delete({ where: { id: sentenceId } })
  }
}

export const resolveVocabularySourceMeta = async (
  sourceType: SourceType,
  sourceId: string,
): Promise<{ source: string; sourceUrl: string }> => {
  const resolvedSources = await resolveVocabularySentenceSources([
    { sourceType, sourceId },
  ])
  const resolvedSource = resolvedSources[sentenceSourceKey(sourceType, sourceId)]
  if (resolvedSource) return resolvedSource

  if (sourceType === 'AUDIO_DIALOGUE') {
    const sentence = await prisma.vocabularySentence.findFirst({
      where: { sourceType, sourceId },
      select: { source: true, sourceUrl: true },
    })
    if (sentence) {
      return {
        source: sentence.source || '听力',
        sourceUrl: sentence.sourceUrl || '#',
      }
    }
    const parsedSource = parseAudioDialogueSourceId(sourceId)
    if (parsedSource) {
      const materialId = await resolveMaterialId(
        MaterialType.LISTENING,
        parsedSource.materialId,
      )
      const material = materialId
        ? await prisma.material.findUnique({
            where: { id: materialId },
            select: { id: true, title: true },
          })
        : null
      if (material) {
        return {
          source: `听力：${material.title}`,
          sourceUrl: `/listening/${material.id}`,
        }
      }
    }
    return { source: '听力', sourceUrl: '#' }
  }

  if (sourceType === 'MEDIA_SUBTITLE_LINE') {
    const sentence = await prisma.vocabularySentence.findFirst({
      where: { sourceType, sourceId },
      select: { source: true, sourceUrl: true },
    })
    if (sentence) {
      return {
        source: sentence.source || '影视字幕',
        sourceUrl: sentence.sourceUrl || '#',
      }
    }
    return { source: '影视字幕', sourceUrl: '#' }
  }

  if (sourceType === 'ARTICLE_TEXT') {
    const materialId = await resolveMaterialId(
      MaterialType.READING,
      sourceId,
    )
    const material = materialId
      ? await prisma.material.findUnique({
          where: { id: materialId },
          select: { id: true, title: true },
        })
      : null
    if (material) {
      return {
        source: `阅读：${material.title}`,
        sourceUrl: `/reading/articles/${material.id}`,
      }
    }
    return { source: '阅读', sourceUrl: '#' }
  }

  if (sourceType === 'QUIZ_QUESTION') {
    const question = await prisma.question.findUnique({
      where: { id: sourceId },
      select: {
        id: true,
        material: { select: { id: true, title: true, type: true } },
      },
    })
    if (question?.material?.type === MaterialType.VOCAB_GRAMMAR) {
      return {
        source: `题目：${question.material.title}`,
        sourceUrl: '/practice/custom',
      }
    }
    if (question?.material?.type === MaterialType.READING) {
      return {
        source: `阅读题目：${question.material.title}`,
        sourceUrl: `/reading/articles/${question.material.id}`,
      }
    }
    return { source: '题目', sourceUrl: '#' }
  }

  return { source: '未知来源', sourceUrl: '#' }
}

export const listVocabularySentenceRecords = async (
  vocabularyId: string,
): Promise<VocabularySentenceRecord[]> => {
  const links = await prisma.vocabularySentenceLink.findMany({
    where: { vocabularyId },
    include: { sentence: true },
    orderBy: { createdAt: 'asc' },
  })
  return dedupeAndRankSentences(
    links.map(link => ({
      text: link.sentence.text,
      source: link.sentence.source,
      sourceUrl: link.sentence.sourceUrl,
      translation: link.sentence.translation || null,
      audioFile: link.sentence.audioFile || null,
      sourceType: link.sentence.sourceType,
      meaningIndex: link.meaningIndex ?? null,
      posTags: normalizeSentencePosTags(parseJsonStringList(link.posTags)),
    })),
    16,
  )
}
