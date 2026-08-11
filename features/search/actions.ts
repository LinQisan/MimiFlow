'use server'

import prisma from '@/lib/prisma'
import { parseJsonStringList } from '@/utils/text/jsonList'
import {
  normalizeQuestionContext,
  normalizeQuestionOptions,
} from '@/lib/repositories/materials'
import { normalizeMediaSubtitleSearchText } from '@/lib/media-subtitles/search-index'
import { MaterialType } from '@prisma/client'
import {
  buildSearchDetailHref,
  extractMaterialSearchText,
  formatMediaDialogueMeta,
  formatPassageMeta,
  includesAllTokens,
  normalizeKeyword,
  shortText,
  sortByScore,
  tokenizeKeyword,
} from './domain'

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
    audioDialogueRows,
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
                  path: '$.text',
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
                  path: '$.description',
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

  const rankedAudioDialogueRows = sortByScore(
    audioDialogueRows,
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

  const audioDialogueResults: GlobalSearchResult[] = rankedAudioDialogueRows.map(
    item => ({
      id: `dialogue-audio:${item.sourceId}`,
      type: 'dialogue',
      title: shortText(item.text, 48),
      snippet: shortText(item.text, 100),
      href: buildSearchDetailHref(`dialogue-audio:${item.sourceId}`, 'dialogue', q),
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
    ...audioDialogueResults,
  ].slice(0, 50)
}
