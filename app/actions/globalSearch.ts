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
  targetHref?: string
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

const normalizeKeyword = (keyword: string) =>
  keyword
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const tokenizeKeyword = (keyword: string) =>
  normalizeKeyword(keyword)
    .split(' ')
    .map(item => item.trim())
    .filter(Boolean)

const buildTypeSet = (types?: GlobalSearchType[]) =>
  new Set<GlobalSearchType>(types && types.length > 0 ? types : DEFAULT_TYPES)

const getMatchScore = (
  keyword: string,
  fields: Array<string | null | undefined>,
) => {
  const tokens = tokenizeKeyword(keyword).map(item => item.toLowerCase())
  if (tokens.length === 0) return 0
  let score = 0

  for (const raw of fields) {
    if (!raw) continue
    const value = raw.toLowerCase()
    for (const token of tokens) {
      if (value === token) score += 120
      else if (value.startsWith(token)) score += 80
      else if (value.includes(token)) score += 40
    }
  }

  return score
}

const includesAllTokens = (
  fields: Array<string | null | undefined>,
  tokens: string[],
) => {
  if (tokens.length === 0) return false
  const normalizedFields = fields
    .filter(Boolean)
    .map(item => String(item).toLowerCase())
  return tokens.every(token =>
    normalizedFields.some(field => field.includes(token.toLowerCase())),
  )
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

const buildSearchDetailHref = (resultId: string, type: GlobalSearchType, q: string) => {
  const params = new URLSearchParams()
  params.set('rid', resultId)
  params.set('type', type)
  if (q) params.set('q', q)
  return `/search/result?${params.toString()}`
}

export async function searchGlobalContent(
  keyword: string,
  options?: { types?: GlobalSearchType[] },
): Promise<GlobalSearchResult[]> {
  const q = normalizeKeyword(keyword)
  const tokens = tokenizeKeyword(q)
  if (!q) return []
  if (tokens.length === 0) return []
  const primaryToken = tokens[0]

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
              { word: { contains: primaryToken } },
              { pronunciations: { contains: primaryToken } },
              { partsOfSpeech: { contains: primaryToken } },
              { meanings: { contains: primaryToken } },
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
            OR: [
              { text: { contains: primaryToken } },
              { source: { contains: primaryToken } },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : Promise.resolve([]),

    typeSet.has('passage')
      ? prisma.material.findMany({
        where: {
          type: MaterialType.READING,
          OR: [
            { title: { contains: primaryToken } },
            {
              contentPayload: {
                path: ['text'],
                string_contains: primaryToken,
              },
            },
          ],
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
          OR: [
            { title: { contains: primaryToken } },
            {
              contentPayload: {
                path: ['description'],
                string_contains: primaryToken,
              },
            },
          ],
        },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : Promise.resolve([]),

    typeSet.has('question')
      ? prisma.question.findMany({
        where: {
          OR: [
            { prompt: { contains: primaryToken } },
            { context: { contains: primaryToken } },
          ],
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
          where: {
            sourceType: 'AUDIO_DIALOGUE',
            text: { contains: primaryToken },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : Promise.resolve([]),
  ])

  const rankedVocabRows = sortByScore(
    vocabRows,
    item => [item.word, item.pronunciations, item.partsOfSpeech, item.meanings],
    q,
  ).filter(item =>
    includesAllTokens(
      [item.word, item.pronunciations, item.partsOfSpeech, item.meanings],
      tokens,
    ),
  )

  const rankedSentenceRows = sortByScore(
    sentenceRows,
    item => [item.text, item.source],
    q,
  ).filter(item => includesAllTokens([item.text, item.source], tokens))

  const rankedPassageRows = sortByScore(
    passageRows,
    item => [
      item.title,
      String(item.contentPayload),
      item.collectionMaterials[0]?.collection.title,
    ],
    q,
  ).filter(item =>
    includesAllTokens(
      [
        item.title,
        String(item.contentPayload),
        item.collectionMaterials[0]?.collection.title,
      ],
      tokens,
    ),
  )

  const rankedQuizRows = sortByScore(
    quizRows,
    item => [item.title, String(item.contentPayload)],
    q,
  ).filter(item =>
    includesAllTokens([item.title, String(item.contentPayload)], tokens),
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
  ).filter(item =>
    includesAllTokens(
      [
        item.prompt,
        item.context,
        item.material?.title,
        ...normalizeQuestionOptions(item.options, item.answer).map(opt => opt.text),
      ],
      tokens,
    ),
  )

  const rankedDialogueRows = sortByScore(
    dialogueRows,
    item => [item.text, item.source],
    q,
  ).filter(item => includesAllTokens([item.text, item.source], tokens))

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
      href: buildSearchDetailHref(`vocab-${item.id}`, 'vocabulary', q),
      targetHref: `/vocabulary?${focusParams.toString()}`,
      meta: pronunciations.length > 0 ? pronunciations.join(' / ') : '单词',
    }
  })

  const sentenceResults: GlobalSearchResult[] = rankedSentenceRows.map(
    item => ({
      id: `sentence-${item.id}`,
      type: 'sentence',
      title: item.text,
      snippet: '',
      href: buildSearchDetailHref(`sentence-${item.id}`, 'sentence', q),
      targetHref: item.sourceUrl || '/search',
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
      href: buildSearchDetailHref(`passage-${item.id}`, 'passage', q),
      targetHref: '/exam/papers',
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
    href: buildSearchDetailHref(`quiz-${item.id}`, 'quiz', q),
    targetHref: '/exam/papers',
    meta: '题库',
    keyword: q,
  }))

  const questionResults: GlobalSearchResult[] = rankedQuestionRows.map(
    item => ({
      id: `question-${item.id}`,
      type: 'question',
      title: shortText(normalizeQuestionContext(item.prompt, item.context), 52),
      snippet: shortText(normalizeQuestionContext(item.prompt, item.context), 100),
      href: buildSearchDetailHref(`question-${item.id}`, 'question', q),
      targetHref: '/exam/papers',
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
      href: buildSearchDetailHref(`dialogue-${item.sourceId}`, 'dialogue', q),
      targetHref: item.sourceUrl || '/shadowing',
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

export async function getGlobalSearchResultDetail(
  resultId: string,
  type: GlobalSearchType,
) {
  const rid = (resultId || '').trim()
  if (!rid) return null

  if (type === 'vocabulary' && rid.startsWith('vocab-')) {
    const id = rid.slice('vocab-'.length)
    const row = await prisma.vocabulary.findUnique({
      where: { id },
      include: {
        sentenceLinks: {
          include: { sentence: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    })
    if (!row) return null
    const focusParams = new URLSearchParams()
    focusParams.set('focus', row.id)
    if (row.groupName) focusParams.set('group', row.groupName)
    focusParams.set('q', row.word)
    return {
      title: row.word,
      type,
      targetHref: `/vocabulary?${focusParams.toString()}`,
      raw: row,
    }
  }

  if (type === 'sentence' && rid.startsWith('sentence-')) {
    const id = rid.slice('sentence-'.length)
    const row = await prisma.vocabularySentence.findUnique({ where: { id } })
    if (!row) return null
    return {
      title: row.text,
      type,
      targetHref: row.sourceUrl || '/search',
      raw: row,
    }
  }

  if (type === 'passage' && rid.startsWith('passage-')) {
    const id = rid.slice('passage-'.length)
    const row = await prisma.material.findUnique({
      where: { id },
      include: {
        collectionMaterials: {
          include: { collection: true },
        },
        questions: true,
      },
    })
    if (!row) return null
    return {
      title: row.title || toLegacyMaterialId(row.id),
      type,
      targetHref: '/exam/papers',
      raw: row,
    }
  }

  if (type === 'quiz' && rid.startsWith('quiz-')) {
    const id = rid.slice('quiz-'.length)
    const row = await prisma.material.findUnique({
      where: { id },
      include: {
        collectionMaterials: {
          include: { collection: true },
        },
        questions: true,
      },
    })
    if (!row) return null
    return {
      title: row.title || toLegacyMaterialId(row.id),
      type,
      targetHref: '/exam/papers',
      raw: row,
    }
  }

  if (type === 'question' && rid.startsWith('question-')) {
    const id = rid.slice('question-'.length)
    const row = await prisma.question.findUnique({
      where: { id },
      include: {
        material: {
          include: {
            collectionMaterials: {
              include: { collection: true },
            },
          },
        },
      },
    })
    if (!row) return null
    return {
      title: normalizeQuestionContext(row.prompt, row.context),
      type,
      targetHref: '/exam/papers',
      raw: row,
    }
  }

  if (type === 'dialogue' && rid.startsWith('dialogue-')) {
    const sourceId = rid.slice('dialogue-'.length)
    const rows = await prisma.vocabularySentence.findMany({
      where: {
        sourceType: 'AUDIO_DIALOGUE',
        sourceId,
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
    if (rows.length === 0) return null
    return {
      title: rows[0].text,
      type,
      targetHref: rows[0].sourceUrl || '/shadowing',
      raw: rows,
    }
  }

  return null
}
