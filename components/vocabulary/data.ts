import 'server-only'

import type { Prisma } from '@prisma/client'
import {
  listVocabularyDetailsByWords,
  listVocabularyGroups,
  listVocabularyTagOptions,
} from '@/modules/knowledge/vocabulary/server/repository'
import { listWordbookOptions } from '@/modules/knowledge/wordbooks/repository'
import {
  resolveVocabularyLanguageCode,
} from '@/modules/knowledge/vocabulary/domain/language'
import { parseWordbookFilter } from '@/modules/knowledge/vocabulary/domain/wordbook-list'
import { toVocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'
import { parseJsonStringList } from '@/utils/text/jsonList'
import {
  getVocabularyPartOfSpeechFilterOptions,
  matchesVocabularyPartsOfSpeech,
  normalizeVocabularyPartOfSpeechFilter,
} from '@/utils/vocabulary/partOfSpeech'
import { selectLatestVocabularyWordAudio } from '@/utils/vocabulary/audioPriority'
import { normalizeVocabularyWord } from '@/modules/knowledge/vocabulary/domain/normalized-word'
import type {
  FilterState,
  LearnStatus,
  OptionItem,
  VocabWord,
  WordLevel,
} from './types'

const VOCABULARY_PAGE_SIZE = 30

interface VocabularyPageData {
  words: VocabWord[]
  total: number
  totalPages: number
  tabs: { key: string; label: string; count: number }[]
  sortOptions: OptionItem[]
  posOptions: OptionItem[]
  tagOptions: OptionItem[]
  bookOptions: OptionItem[]
}

const LANGUAGE_LABELS: Record<string, string> = {
  ja: '日语',
  en: '英语',
  zh: '中文',
}

const normalizeWordKey = normalizeVocabularyWord

const JLPT_RE = /(?<![A-Z0-9])N([1-5])(?![0-9])/i

const levelOfText = (text: string): WordLevel | null => {
  const hit = JLPT_RE.exec(text || '')
  return hit ? (`N${hit[1]}` as WordLevel) : null
}

let warnedMultiLevel = false

/**
 * 级别优先级：显式字段（词书关联 jlpt）> 标签 > 单词书名（如 N1語彙トレーニング）。
 * 多命中取数字最小（最难）；同一进程只 warn 一次，方便后续清洗数据。
 */
function resolveLevel(input: {
  explicit?: string | null
  tags: string[]
  bookTitle?: string
}): WordLevel | null {
  const direct = (input.explicit || '').trim().toUpperCase()
  if (/^N[1-5]$/.test(direct)) return direct as WordLevel
  const hits = [
    ...input.tags.map(tag => levelOfText(tag)),
    levelOfText(input.bookTitle || ''),
  ].filter((level): level is WordLevel => level !== null)
  const distinct = Array.from(new Set(hits)).sort()
  if (distinct.length > 1 && !warnedMultiLevel) {
    warnedMultiLevel = true
    console.warn(`[vocabulary] one word matched multiple JLPT levels: ${distinct.join(', ')}`)
  }
  return distinct[0] || null
}

/**
 * ts-fsrs 卡片 state：0 New / 1 Learning / 2 Review / 3 Relearning。
 * 2 只表示“毕业出学习阶段”，stability < 21 天仍算学习中（Anki 成熟卡惯例）；
 * 无 stability 时退用 scheduled_days。
 */
function toStatus(
  review?: { state: number; stability: number; scheduled_days?: number } | null,
): LearnStatus {
  if (!review || review.state === 0) return 'new'
  const horizon =
    typeof review.stability === 'number' && review.stability > 0
      ? review.stability
      : (review.scheduled_days ?? 0)
  if (review.state === 2 && horizon >= 21) return 'mastered'
  return 'learning'
}

export async function getVocabularyPageData(filters: FilterState): Promise<VocabularyPageData> {
  const keyword = filters.q.trim().slice(0, 50)
  const parsedBook = parseWordbookFilter(filters.book)
  const where: Prisma.VocabularyWhereInput = {
    AND: [
      ...(keyword
        ? [
            {
              OR: [
                { word: { contains: keyword } },
                { pronunciations: { contains: keyword } },
                { etymologies: { contains: keyword } },
                { meanings: { contains: keyword } },
              ],
            },
          ]
        : []),
      ...(filters.tag !== 'all'
        ? [{ tags: { some: { tag: { name: filters.tag } } } } ]
        : []),
      ...(parsedBook.kind === 'none'
        ? [{ wordbooks: { none: {} } }]
        : parsedBook.kind === 'series'
          ? [{ wordbooks: { some: { wordbook: { seriesId: parsedBook.id } } } }]
          : parsedBook.kind === 'wordbook'
            ? [{ wordbooks: { some: { wordbookId: parsedBook.id } } }]
            : []),
    ],
  }

  const [groupRows, tagOptions, wordbookOptions] = await Promise.all([
    listVocabularyGroups(where),
    listVocabularyTagOptions(),
    listWordbookOptions(),
  ])

  const wordbookById = new Map(wordbookOptions.map(item => [item.id, item]))
  type GroupRow = (typeof groupRows)[number]
  const groups = new Map<string, { word: string; ids: string[]; partsOfSpeech: string[]; sample: GroupRow }>()
  for (const row of groupRows) {
    const key = normalizeWordKey(row.word)
    const current = groups.get(key)
    if (current) {
      current.ids.push(row.id)
      current.partsOfSpeech.push(...parseJsonStringList(row.partsOfSpeech))
    } else {
      groups.set(key, {
        word: row.word,
        ids: [row.id],
        partsOfSpeech: parseJsonStringList(row.partsOfSpeech),
        sample: row,
      })
    }
  }

  const posFilter = normalizeVocabularyPartOfSpeechFilter(filters.pos || 'all') || 'all'
  let entries = [...groups.values()].filter(group =>
    matchesVocabularyPartsOfSpeech(group.partsOfSpeech, posFilter),
  )
  if (filters.sort === 'word') {
    entries.sort((a, b) => a.word.localeCompare(b.word, 'ja'))
  }

  const langOf = (group: { word: string; sample: GroupRow }) =>
    resolveVocabularyLanguageCode({
      word: group.word,
      pronunciations: parseJsonStringList(group.sample.pronunciations),
      sourceType: group.sample.sourceType,
    })
  if (filters.lang !== 'all') {
    entries = entries.filter(group => langOf(group) === filters.lang)
  }

  const tabs = [...entries
    .reduce((acc, group) => {
      const lang = langOf(group)
      acc.set(lang, (acc.get(lang) || 0) + 1)
      return acc
    }, new Map<string, number>())
    .entries()].map(([key, count]) => ({
    key,
    label: LANGUAGE_LABELS[key] || key,
    count,
  }))

  const total = entries.length
  const totalPages = Math.max(1, Math.ceil(total / VOCABULARY_PAGE_SIZE))
  const page = Math.min(Math.max(1, filters.page), totalPages)
  const pageEntries = entries.slice((page - 1) * VOCABULARY_PAGE_SIZE, page * VOCABULARY_PAGE_SIZE)
  const details = await listVocabularyDetailsByWords(pageEntries.map(group => group.word))
  const detailsByWord = new Map(details.map(item => [normalizeWordKey(item.word), item]))

  const words: VocabWord[] = pageEntries.map(group => {
    const detail = detailsByWord.get(normalizeWordKey(group.word))
    if (!detail) {
      return {
        id: group.ids[0],
        word: group.word,
        reading: '',
        meaning: '',
        bookName: '',
        unit: '',
        level: null,
        status: 'new' as const,
      }
    }
    const meta = toVocabularyMeta(detail)
    const membership = detail.wordbooks[0]?.wordbook
    const membershipJlpt = detail.wordbooks[0]?.jlpt
    const option = membership ? wordbookById.get(membership.id) : undefined
    const tagNames = detail.tags.map(link => link.tag.name)
    const review = Array.isArray(detail.review) ? detail.review[0] : detail.review
    // 读音必须是假名：脏数据里偶有汉字混入 pronunciations，兜底为空而非展示错字
    const reading = meta.pronunciations.find(item => /[\u3040-\u30ff]/.test(item)) || ''
    return {
      id: detail.id,
      word: detail.word,
      reading,
      etymologies: meta.etymologies,
      meaning: meta.meanings.slice(0, 2).join(' / '),
      bookName: option?.series.title || '',
      unit: membership?.title || '',
      bookId: membership?.id,
      level: resolveLevel({
        explicit: membershipJlpt,
        tags: tagNames,
        bookTitle: membership?.title,
      }),
      status: toStatus(review || null),
      audioUrl: selectLatestVocabularyWordAudio([detail]),
      isFavorite: false,
    }
  })

  return {
    words,
    total,
    totalPages,
    tabs,
    sortOptions: [
      { value: 'recent', label: '最新收录' },
      { value: 'word', label: '单词排序' },
    ],
    posOptions: [
      { value: 'all', label: '全部词性' },
      ...getVocabularyPartOfSpeechFilterOptions(
        entries.flatMap(group => group.partsOfSpeech),
      ).map(name => ({ value: name, label: name })),
    ],
    tagOptions: [
      { value: 'all', label: '全部标签' },
      ...tagOptions.map(tag => ({ value: tag.name, label: tag.name })),
    ],
    bookOptions: [
      { value: 'all', label: '全部单词书' },
      ...wordbookOptions.map(item => ({
        value: (item as { id: string }).id,
        label: (item as { title: string }).title,
      })),
    ],
  }
}
