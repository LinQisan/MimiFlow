'use server'

import prisma from '@/lib/prisma'
import { parseJsonStringList } from '@/utils/jsonList'
import {
  normalizeQuestionContext,
  normalizeQuestionOptions,
  toLegacyMaterialId,
} from '@/lib/repositories/materials.repo'
import { MaterialType } from '@prisma/client'

export type GlobalSearchResult = {
  id: string
  type: 'vocabulary' | 'sentence' | 'passage' | 'quiz' | 'question' | 'dialogue'
  title: string
  snippet: string
  href: string
  meta: string
  keyword?: string
}

export type GlobalSearchType = GlobalSearchResult['type']

const DEFAULT_TYPES: GlobalSearchType[] = [
  'vocabulary',
  'sentence',
  'passage',
  'quiz',
  'question',
  'dialogue',
]

const shortText = (text: string, max = 96) => {
  const value = (text || '').trim()
  if (value.length <= max) return value
  return `${value.slice(0, max)}...`
}

const normalizeKeyword = (keyword: string) => keyword.trim()

const buildTypeSet = (types?: GlobalSearchType[]) =>
  new Set<GlobalSearchType>(types && types.length > 0 ? types : DEFAULT_TYPES)

const getMatchScore = (
  keyword: string,
  fields: Array<string | null | undefined>,
) => {
  const q = keyword.toLowerCase()
  let score = 0

  for (const raw of fields) {
    if (!raw) continue
    const value = raw.toLowerCase()

    if (value === q) score += 120
    else if (value.startsWith(q)) score += 80
    else if (value.includes(q)) score += 40
  }

  return score
}

const sortByScore = <T>(
  rows: T[],
  getFields: (row: T) => Array<string | null | undefined>,
  keyword: string,
) =>
  [...rows].sort(
    (a, b) =>
      getMatchScore(keyword, getFields(b)) -
      getMatchScore(keyword, getFields(a)),
  )

const formatPassageMeta = (item: { collectionTitle?: string | null }) => {
  const paperName = item.collectionTitle?.trim()

  if (paperName) return paperName
  return '文章'
}

export async function searchGlobalContent(
  keyword: string,
  options?: { types?: GlobalSearchType[] },
): Promise<GlobalSearchResult[]> {
  const q = normalizeKeyword(keyword)
  if (!q) return []

  const typeSet = buildTypeSet(options?.types)

  const [
    vocabRows,
    sentenceRows,
    passageRows,
    quizRows,
    questionRows,
    dialogueRows,
  ] = await Promise.all([
    typeSet.has('vocabulary')
      ? prisma.vocabulary.findMany({
          where: {
            OR: [
              { word: { contains: q } },
              { pronunciations: { contains: q } },
              { partsOfSpeech: { contains: q } },
              { meanings: { contains: q } },
            ],
          },
          include: {
            sentenceLinks: {
              include: { sentence: true },
              orderBy: { createdAt: 'asc' },
              take: 1,
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : Promise.resolve([]),

    typeSet.has('sentence')
      ? prisma.vocabularySentence.findMany({
          where: {
            OR: [{ text: { contains: q } }, { source: { contains: q } }],
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : Promise.resolve([]),

    typeSet.has('passage')
      ? prisma.material.findMany({
        where: {
          type: MaterialType.READING,
          OR: [{ title: { contains: q } }, { contentPayload: { path: ['text'], string_contains: q } }],
        },
        include: {
          collectionMaterials: {
            take: 1,
            include: { collection: { select: { title: true } } },
          },
        },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : Promise.resolve([]),

    typeSet.has('quiz')
      ? prisma.material.findMany({
        where: {
          type: MaterialType.VOCAB_GRAMMAR,
          OR: [{ title: { contains: q } }, { contentPayload: { path: ['description'], string_contains: q } }],
        },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : Promise.resolve([]),

    typeSet.has('question')
      ? prisma.question.findMany({
        where: {
          OR: [{ prompt: { contains: q } }, { context: { contains: q } }],
          },
          include: {
          material: {
            select: { id: true, title: true, type: true },
          },
          },
          take: 20,
        })
      : Promise.resolve([]),

    typeSet.has('dialogue')
      ? prisma.vocabularySentence.findMany({
          where: { sourceType: 'AUDIO_DIALOGUE', text: { contains: q } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : Promise.resolve([]),
  ])

  const rankedVocabRows = sortByScore(
    vocabRows,
    item => [item.word, item.pronunciations, item.partsOfSpeech, item.meanings],
    q,
  )

  const rankedSentenceRows = sortByScore(
    sentenceRows,
    item => [item.text, item.source],
    q,
  )

  const rankedPassageRows = sortByScore(
    passageRows,
    item => [
      item.title,
      String(item.contentPayload),
      item.collectionMaterials[0]?.collection.title,
    ],
    q,
  )

  const rankedQuizRows = sortByScore(
    quizRows,
    item => [item.title, String(item.contentPayload)],
    q,
  )

  const rankedQuestionRows = sortByScore(
    questionRows,
    item => [
      item.prompt,
      item.context,
      item.material?.title,
      ...normalizeQuestionOptions(item.options, item.answer).map(opt => opt.text),
    ],
    q,
  )

  const rankedDialogueRows = sortByScore(
    dialogueRows,
    item => [item.text, item.source],
    q,
  )

  const vocabularyResults: GlobalSearchResult[] = rankedVocabRows.map(item => {
    const firstSentence = item.sentenceLinks[0]?.sentence
    const meanings = parseJsonStringList(item.meanings).slice(0, 2)
    const pronunciations = parseJsonStringList(item.pronunciations).slice(0, 1)

    const focusParams = new URLSearchParams()
    focusParams.set('focus', item.id)
    if (item.groupName) focusParams.set('group', item.groupName)
    focusParams.set('q', item.word)

    return {
      id: `vocab-${item.id}`,
      type: 'vocabulary',
      title: item.word,
      snippet:
        meanings.length > 0
          ? meanings.join('；')
          : shortText(firstSentence?.text || '暂无释义', 80),
      href: `/vocabulary?${focusParams.toString()}`,
      meta: pronunciations.length > 0 ? pronunciations.join(' / ') : '单词',
    }
  })

  const sentenceResults: GlobalSearchResult[] = rankedSentenceRows.map(
    item => ({
      id: `sentence-${item.id}`,
      type: 'sentence',
      title: item.text,
      snippet: '',
      href: item.sourceUrl || '/sentences',
      meta: item.source || '句子来源',
      keyword: q,
    }),
  )

  const passageResults: GlobalSearchResult[] = rankedPassageRows.map(item => {
    const payload = item.contentPayload as Record<string, unknown>
    const content = String(payload.text || payload.description || '')
    const sentences = content.split(/[。！？\n]+/).filter(s => s.trim())
    const matchingSentence = sentences.find(s =>
      s.toLowerCase().includes(q.toLowerCase()),
    )
    const displaySnippet = matchingSentence
      ? shortText(matchingSentence.trim(), 120)
      : shortText(content, 120)
    return {
      id: `passage-${item.id}`,
      type: 'passage',
      title: item.title?.trim() || '',
      snippet: displaySnippet,
      href: `/articles/${toLegacyMaterialId(item.id)}`,
      meta: formatPassageMeta({
        collectionTitle: item.collectionMaterials[0]?.collection.title,
      }),
      keyword: q,
    }
  })

  const quizResults: GlobalSearchResult[] = rankedQuizRows.map(item => ({
    id: `quiz-${item.id}`,
    type: 'quiz',
    title: item.title || '',
    snippet: shortText(String((item.contentPayload as Record<string, unknown>).description || '')),
    href: `/practice`,
    meta: '题库',
    keyword: q,
  }))

  const questionResults: GlobalSearchResult[] = rankedQuestionRows.map(
    item => ({
      id: `question-${item.id}`,
      type: 'question',
      title: shortText(normalizeQuestionContext(item.prompt, item.context), 52),
      snippet: shortText(normalizeQuestionContext(item.prompt, item.context), 100),
      href:
        item.material?.type === MaterialType.READING
          ? `/articles/${toLegacyMaterialId(item.material.id)}`
          : '/practice',
      meta: item.material?.title || '题目',
      keyword: q,
    }),
  )

  const dialogueResults: GlobalSearchResult[] = rankedDialogueRows.map(
    item => ({
      id: `dialogue-${item.sourceId}`,
      type: 'dialogue',
      title: shortText(item.text, 48),
      snippet: shortText(item.text, 100),
      href: item.sourceUrl || '/shadowing',
      meta: item.source,
      keyword: q,
    }),
  )

  return [
    ...vocabularyResults,
    ...sentenceResults,
    ...passageResults,
    ...quizResults,
    ...questionResults,
    ...dialogueResults,
  ].slice(0, 50)
}
