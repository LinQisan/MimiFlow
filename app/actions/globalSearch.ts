'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { parseJsonStringList } from '@/utils/text/jsonList'
import {
  normalizeQuestionContext,
  normalizeQuestionOptions,
  toLegacyMaterialId,
} from '@/lib/repositories/materials'
import { normalizeMediaSubtitleSearchText } from '@/lib/media-subtitles/search-index'
import { MaterialType } from '@prisma/client'
import { Prisma } from '@prisma/client'

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
type JsonRecord = Record<string, unknown>

const asRecord = (value: unknown): JsonRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null

const asStringOrNull = (value: unknown) => {
  if (value === null || value === undefined) return null
  return typeof value === 'string' ? value : String(value)
}

const asNumberOrDefault = (value: unknown, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value)
  if (typeof value === 'string') {
    const num = Number(value)
    if (Number.isFinite(num)) return Math.floor(num)
  }
  return fallback
}

const toJsonValue = (
  value: unknown,
  fallback: Prisma.InputJsonValue,
): Prisma.InputJsonValue =>
  value === undefined ? fallback : (value as Prisma.InputJsonValue)

const toNullableJsonValue = (
  value: unknown,
):
  | Prisma.InputJsonValue
  | Prisma.NullableJsonNullValueInput
  | undefined => {
  if (value === undefined) return undefined
  if (value === null) return Prisma.JsonNull
  return value as Prisma.InputJsonValue
}

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

const asString = (value: unknown) => (typeof value === 'string' ? value : '')

const formatMediaDialogueMeta = (input: {
  sourceType: 'TV' | 'MOVIE'
  workTitle: string
  season: string
  episode: string
}) => {
  const title = input.workTitle.trim() || '未命名作品'
  if (input.sourceType === 'TV') {
    const seasonText = input.season.trim() ? `第${input.season.trim()}季` : '未标季'
    const episodeText = input.episode.trim()
      ? `第${input.episode.trim()}集`
      : '未标集'
    return `电视剧 · ${title} · ${seasonText} · ${episodeText}`
  }
  return `电影 · ${title}`
}

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
  const normalizedPrimaryToken = normalizeMediaSubtitleSearchText(primaryToken)

  const typeSet = buildTypeSet(options?.types)

  const [
    vocabRows,
    sentenceRows,
    passageRows,
    quizRows,
    questionRows,
    legacyDialogueRows,
    mediaDialogueRows,
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

    typeSet.has('dialogue')
      ? prisma.mediaSubtitleLine.findMany({
          where: {
            searchText: { contains: normalizedPrimaryToken },
          },
          select: {
            id: true,
            materialId: true,
            stableId: true,
            sequenceId: true,
            text: true,
            note: true,
            materialTitle: true,
            workTitle: true,
            season: true,
            episode: true,
            subtitleSourceType: true,
          },
          orderBy: [{ updatedAt: 'desc' }, { sequenceId: 'asc' }],
          take: 80,
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

  const rankedLegacyDialogueRows = sortByScore(
    legacyDialogueRows,
    item => [item.text, item.source],
    q,
  ).filter(item => includesAllTokens([item.text, item.source], tokens))

  const rankedMediaDialogueRows = sortByScore(
    mediaDialogueRows,
    item => [
      item.text,
      item.note,
      item.materialTitle,
      item.workTitle,
      item.season,
      item.episode,
      item.subtitleSourceType === 'TV' ? '电视剧' : '电影',
    ],
    q,
  ).filter(item =>
    includesAllTokens(
      [
        item.text,
        item.note,
        item.materialTitle,
        item.workTitle,
        item.season,
        item.episode,
        item.subtitleSourceType === 'TV' ? '电视剧' : '电影',
      ],
      tokens,
    ),
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

  const legacyDialogueResults: GlobalSearchResult[] = rankedLegacyDialogueRows.map(
    item => ({
      id: `dialogue-legacy:${item.sourceId}`,
      type: 'dialogue',
      title: shortText(item.text, 48),
      snippet: shortText(item.text, 100),
      href: buildSearchDetailHref(`dialogue-legacy:${item.sourceId}`, 'dialogue', q),
      targetHref: item.sourceUrl || '/shadowing',
      meta: item.source,
      keyword: q,
    }),
  )

  const mediaDialogueResults: GlobalSearchResult[] = rankedMediaDialogueRows.map(
    item => {
      const params = new URLSearchParams()
      params.set('q', q)
      params.set('lineStableId', item.stableId)
      return {
        id: `dialogue-media:${item.materialId}::${item.stableId}`,
        type: 'dialogue',
        title: shortText(item.text, 48),
        snippet: shortText(item.text, 100),
        href: buildSearchDetailHref(
          `dialogue-media:${item.materialId}::${item.stableId}`,
          'dialogue',
          q,
        ),
        targetHref: `/media-subtitles/${toLegacyMaterialId(item.materialId)}?${params.toString()}`,
        meta: formatMediaDialogueMeta({
          sourceType: item.subtitleSourceType === 'TV' ? 'TV' : 'MOVIE',
          workTitle: item.workTitle || item.materialTitle,
          season: item.season || '',
          episode: item.episode || '',
        }),
        keyword: q,
      }
    },
  )

  return [
    ...vocabularyResults,
    ...sentenceResults,
    ...passageResults,
    ...quizResults,
    ...questionResults,
    ...mediaDialogueResults,
    ...legacyDialogueResults,
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

  if (type === 'dialogue' && rid.startsWith('dialogue-legacy:')) {
    const sourceId = rid.slice('dialogue-legacy:'.length)
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

  if (type === 'dialogue' && rid.startsWith('dialogue-media:')) {
    const payload = rid.slice('dialogue-media:'.length)
    const separator = payload.indexOf('::')
    if (separator <= 0) return null
    const materialId = payload.slice(0, separator)
    const stableId = payload.slice(separator + 2)
    if (!materialId || !stableId) return null

    const row = await prisma.mediaSubtitleLine.findUnique({
      where: {
        materialId_stableId: {
          materialId,
          stableId,
        },
      },
      include: {
        material: {
          select: {
            id: true,
            title: true,
            contentPayload: true,
          },
        },
      },
    })
    if (!row) return null

    const params = new URLSearchParams()
    params.set('lineStableId', stableId)

    return {
      title: row.text.trim() || row.material.title || '影视字幕',
      type,
      targetHref: `/media-subtitles/${toLegacyMaterialId(row.material.id)}?${params.toString()}`,
      raw: {
        material: row.material,
        dialogue: row,
        meta: formatMediaDialogueMeta({
          sourceType: row.subtitleSourceType === 'TV' ? 'TV' : 'MOVIE',
          workTitle: row.workTitle || row.materialTitle,
          season: row.season || '',
          episode: row.episode || '',
        }),
      },
    }
  }

  return null
}

export async function updateGlobalSearchResultDetail(input: {
  resultId: string
  type: GlobalSearchType
  rawJson: string
}) {
  const rid = (input.resultId || '').trim()
  const type = input.type
  const rawJson = (input.rawJson || '').trim()

  if (!rid || !type) {
    return { success: false, message: '参数缺失，无法保存。' }
  }
  if (!rawJson) {
    return { success: false, message: 'JSON 不能为空。' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    return { success: false, message: 'JSON 格式错误，请检查后重试。' }
  }

  try {
    if (type === 'vocabulary' && rid.startsWith('vocab-')) {
      const id = rid.slice('vocab-'.length)
      const payload = asRecord(parsed)
      if (!payload) return { success: false, message: '单词数据必须是对象。' }
      await prisma.vocabulary.update({
        where: { id },
        data: {
          word: asStringOrNull(payload.word) || '',
          sourceType: (asStringOrNull(payload.sourceType) as
            | 'AUDIO_DIALOGUE'
            | 'MEDIA_SUBTITLE_LINE'
            | 'ARTICLE_TEXT'
            | 'QUIZ_QUESTION') || 'QUIZ_QUESTION',
          sourceId: asStringOrNull(payload.sourceId) || '',
          groupName: asStringOrNull(payload.groupName),
          wordAudio: asStringOrNull(payload.wordAudio),
          pronunciations: asStringOrNull(payload.pronunciations),
          partsOfSpeech: asStringOrNull(payload.partsOfSpeech),
          meanings: asStringOrNull(payload.meanings),
          folderId: asStringOrNull(payload.folderId),
        },
      })
      revalidatePath('/vocabulary')
      revalidatePath('/search')
      revalidatePath('/search/result')
      return { success: true, message: '单词数据已保存。' }
    }

    if (type === 'sentence' && rid.startsWith('sentence-')) {
      const id = rid.slice('sentence-'.length)
      const payload = asRecord(parsed)
      if (!payload) return { success: false, message: '句子数据必须是对象。' }
      const text = asStringOrNull(payload.text) || ''
      await prisma.vocabularySentence.update({
        where: { id },
        data: {
          text,
          normalizedText: (asStringOrNull(payload.normalizedText) || text).trim(),
          translation: asStringOrNull(payload.translation),
          audioFile: asStringOrNull(payload.audioFile),
          source: asStringOrNull(payload.source) || '',
          sourceUrl: asStringOrNull(payload.sourceUrl) || '',
          sourceType: asStringOrNull(payload.sourceType) as
            | 'AUDIO_DIALOGUE'
            | 'MEDIA_SUBTITLE_LINE'
            | 'ARTICLE_TEXT'
            | 'QUIZ_QUESTION'
            | null,
          sourceId: asStringOrNull(payload.sourceId),
        },
      })
      revalidatePath('/search')
      revalidatePath('/search/result')
      return { success: true, message: '句子数据已保存。' }
    }

    if (
      (type === 'passage' && rid.startsWith('passage-')) ||
      (type === 'quiz' && rid.startsWith('quiz-'))
    ) {
      const id = rid.slice(type === 'passage' ? 'passage-'.length : 'quiz-'.length)
      const payload = asRecord(parsed)
      if (!payload) return { success: false, message: '材料数据必须是对象。' }
      const materialUpdateData: Prisma.MaterialUpdateInput = {
        title: asStringOrNull(payload.title) || '',
        chapterName: asStringOrNull(payload.chapterName),
        contentPayload: toJsonValue(payload.contentPayload, {}),
      }
      if ('metadata' in payload) {
        materialUpdateData.metadata =
          payload.metadata === null ? Prisma.JsonNull : payload.metadata
      }
      await prisma.material.update({
        where: { id },
        data: materialUpdateData,
      })
      revalidatePath('/exam')
      revalidatePath('/exam/papers')
      revalidatePath('/search')
      revalidatePath('/search/result')
      return { success: true, message: '材料数据已保存。' }
    }

    if (type === 'question' && rid.startsWith('question-')) {
      const id = rid.slice('question-'.length)
      const payload = asRecord(parsed)
      if (!payload) return { success: false, message: '题目数据必须是对象。' }
      await prisma.question.update({
        where: { id },
        data: {
          prompt: asStringOrNull(payload.prompt),
          context: asStringOrNull(payload.context),
          content: toJsonValue(payload.content, {}),
          options: toNullableJsonValue(payload.options),
          answer: toJsonValue(payload.answer, {}),
          analysis: asStringOrNull(payload.analysis),
          note: asStringOrNull(payload.note),
          sortOrder: asNumberOrDefault(payload.sortOrder, 0),
        },
      })
      revalidatePath('/exam')
      revalidatePath('/exam/papers')
      revalidatePath('/search')
      revalidatePath('/search/result')
      return { success: true, message: '题目数据已保存。' }
    }

    if (type === 'dialogue') {
      return {
        success: false,
        message: '当前暂不支持在此页直接修改听力聚合结果，请到对应管理页修改。',
      }
    }

    return { success: false, message: '不支持的类型或结果 ID。' }
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存失败'
    return { success: false, message }
  }
}
