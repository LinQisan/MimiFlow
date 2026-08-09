'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { parseJsonStringList } from '@/utils/text/jsonList'
import {
  normalizeQuestionContext,
  normalizeQuestionOptions,
} from '@/lib/repositories/materials'
import { normalizeMediaSubtitleSearchText } from '@/lib/media-subtitles/search-index'
import { MaterialType, QuestionType } from '@prisma/client'
import { Prisma } from '@prisma/client'
import {
  asNumberOrDefault,
  asStringOrNull,
  buildSearchDetailHref,
  extractMaterialSearchText,
  formatMediaDialogueMeta,
  formatPassageMeta,
  includesAllTokens,
  normalizeKeyword,
  shortText,
  sortByScore,
  toJsonValue,
  toNullableJsonValue,
  tokenizeKeyword,
} from './domain'
import { readOptionalJsonRecord } from '@/lib/validation/schema'
import { encodeMaterialPayload } from '@/lib/codecs/material-payload'
import { encodeQuestionContent } from '@/lib/codecs/question-content'

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

const buildTypeSet = (types?: GlobalSearchType[]) =>
  new Set<GlobalSearchType>(types && types.length > 0 ? types : DEFAULT_TYPES)

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
          select: {
            id: true,
            title: true,
            contentPayload: true,
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
          select: {
            id: true,
            title: true,
            contentPayload: true,
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
          take: 60,
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
      extractMaterialSearchText(MaterialType.READING, item.contentPayload),
      item.collectionMaterials[0]?.collection.title,
    ],
    q,
  ).filter(item =>
    includesAllTokens(
      [
        item.title,
        extractMaterialSearchText(MaterialType.READING, item.contentPayload),
        item.collectionMaterials[0]?.collection.title,
      ],
      tokens,
    ),
  )

  const rankedQuizRows = sortByScore(
    quizRows,
    item => [
      item.title,
      extractMaterialSearchText(MaterialType.VOCAB_GRAMMAR, item.contentPayload),
    ],
    q,
  ).filter(item =>
    includesAllTokens(
      [
        item.title,
        extractMaterialSearchText(MaterialType.VOCAB_GRAMMAR, item.contentPayload),
      ],
      tokens,
    ),
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
      targetHref:
        item.sourceUrl && item.sourceUrl !== '#'
          ? item.sourceUrl
          : `/vocabulary?q=${encodeURIComponent(q)}`,
      meta: item.source || '句子来源',
      keyword: q,
    }),
  )

  const passageResults: GlobalSearchResult[] = rankedPassageRows.map(item => {
    const content = extractMaterialSearchText(
      MaterialType.READING,
      item.contentPayload,
    )
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
      targetHref: `/reading/articles/${item.id}`,
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
    snippet: shortText(
      extractMaterialSearchText(
        MaterialType.VOCAB_GRAMMAR,
        item.contentPayload,
      ),
    ),
    href: buildSearchDetailHref(`quiz-${item.id}`, 'quiz', q),
    targetHref: '/practice',
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
      targetHref: '/practice',
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
      targetHref:
        item.sourceUrl && item.sourceUrl !== '#'
          ? item.sourceUrl
          : '/listening',
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
        targetHref: `/subtitles/${item.materialId}?${params.toString()}`,
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
      title: row.title || row.id,
      type,
      targetHref: '/practice',
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
      title: row.title || row.id,
      type,
      targetHref: '/practice',
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
      targetHref: '/practice',
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
      targetHref: rows[0].sourceUrl || '/listening',
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
      targetHref: `/subtitles/${row.material.id}?${params.toString()}`,
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
      const payload = readOptionalJsonRecord(parsed)
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
          wordAudio: asStringOrNull(payload.wordAudio),
          pronunciations: asStringOrNull(payload.pronunciations),
          partsOfSpeech: asStringOrNull(payload.partsOfSpeech),
          meanings: asStringOrNull(payload.meanings),
        },
      })
      revalidatePath('/vocabulary')
      revalidatePath('/search')
      revalidatePath('/manage/search')
      return { success: true, message: '单词数据已保存。' }
    }

    if (type === 'sentence' && rid.startsWith('sentence-')) {
      const id = rid.slice('sentence-'.length)
      const payload = readOptionalJsonRecord(parsed)
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
      revalidatePath('/manage/search')
      return { success: true, message: '句子数据已保存。' }
    }

    if (
      (type === 'passage' && rid.startsWith('passage-')) ||
      (type === 'quiz' && rid.startsWith('quiz-'))
    ) {
      const id = rid.slice(type === 'passage' ? 'passage-'.length : 'quiz-'.length)
      const payload = readOptionalJsonRecord(parsed)
      if (!payload) return { success: false, message: '材料数据必须是对象。' }
      const materialType =
        type === 'passage' ? MaterialType.READING : MaterialType.VOCAB_GRAMMAR
      const materialUpdateData: Prisma.MaterialUpdateInput = {
        title: asStringOrNull(payload.title) || '',
        chapterName: asStringOrNull(payload.chapterName),
        contentPayload: encodeMaterialPayload(materialType, payload.contentPayload),
      }
      if ('metadata' in payload) {
        materialUpdateData.metadata =
          payload.metadata === null ? Prisma.JsonNull : payload.metadata
      }
      await prisma.material.update({
        where: { id },
        data: materialUpdateData,
      })
      revalidatePath('/practice')
      revalidatePath('/practice')
      revalidatePath('/search')
      revalidatePath('/manage/search')
      return { success: true, message: '材料数据已保存。' }
    }

    if (type === 'question' && rid.startsWith('question-')) {
      const id = rid.slice('question-'.length)
      const payload = readOptionalJsonRecord(parsed)
      if (!payload) return { success: false, message: '题目数据必须是对象。' }
      await prisma.question.update({
        where: { id },
        data: {
          questionType:
            typeof payload.questionType === 'string' &&
            Object.values(QuestionType).includes(payload.questionType as QuestionType)
              ? (payload.questionType as QuestionType)
              : undefined,
          prompt: asStringOrNull(payload.prompt),
          context: asStringOrNull(payload.context),
          content: encodeQuestionContent(payload.content),
          options: toNullableJsonValue(payload.options),
          answer: toJsonValue(payload.answer, {}),
          analysis: asStringOrNull(payload.analysis),
          note: asStringOrNull(payload.note),
          sortOrder: asNumberOrDefault(payload.sortOrder, 0),
        },
      })
      revalidatePath('/practice')
      revalidatePath('/practice')
      revalidatePath('/search')
      revalidatePath('/manage/search')
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
