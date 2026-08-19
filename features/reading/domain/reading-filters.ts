import type {
  NewsColumn,
  NewsSource,
  NewsType,
} from './news-metadata'

export type ReadingMaterialKind = 'news' | 'exam' | 'article' | 'ebook'
export type ReadingMaterialFilter = 'all' | ReadingMaterialKind
export type ReadingSortMode = 'newest' | 'oldest' | 'title'

export type ReadingFilterState = {
  query: string
  kind: ReadingMaterialFilter
  year: string
  sort: ReadingSortMode
  newsSource: string
  newsType: string
  newsSection: string
  newsColumn: string
  newsEdition: string
  newsTopic: string
  page: number
}

export type ReadingFilterItem = {
  kind: ReadingMaterialKind
  year: string
  newsSource: NewsSource
  newsType: NewsType
  newsSection: string
  newsColumn: NewsColumn
  newsEdition: string
  newsTopic: string
}

export type NewsFilterKey =
  | 'newsSource'
  | 'newsType'
  | 'newsSection'
  | 'newsColumn'
  | 'newsEdition'
  | 'newsTopic'

const NEWS_FILTER_KEYS: NewsFilterKey[] = [
  'newsSource',
  'newsType',
  'newsSection',
  'newsColumn',
  'newsEdition',
  'newsTopic',
]

export const DEFAULT_READING_FILTERS: ReadingFilterState = {
  query: '',
  kind: 'all',
  year: 'all',
  sort: 'newest',
  newsSource: 'all',
  newsType: 'all',
  newsSection: 'all',
  newsColumn: 'all',
  newsEdition: 'all',
  newsTopic: 'all',
  page: 1,
}

const MATERIAL_KINDS = new Set<ReadingMaterialFilter>([
  'all',
  'news',
  'exam',
  'article',
  'ebook',
])
const SORT_MODES = new Set<ReadingSortMode>(['newest', 'oldest', 'title'])

const firstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] || '' : value || ''

export const parseReadingFilters = (
  params: Record<string, string | string[] | undefined>,
): ReadingFilterState => {
  const kind = firstParam(params.kind) as ReadingMaterialFilter
  const sort = firstParam(params.sort) as ReadingSortMode
  const page = Number.parseInt(firstParam(params.page), 10)

  return {
    query: firstParam(params.q),
    kind: MATERIAL_KINDS.has(kind) ? kind : 'all',
    year: firstParam(params.year) || 'all',
    sort: SORT_MODES.has(sort) ? sort : 'newest',
    newsSource: firstParam(params.source) || 'all',
    newsType: firstParam(params.type) || 'all',
    newsSection: firstParam(params.section) || 'all',
    newsColumn: firstParam(params.column) || 'all',
    newsEdition: firstParam(params.edition) || 'all',
    newsTopic: firstParam(params.topic) || 'all',
    page: Number.isFinite(page) && page > 0 ? page : 1,
  }
}

const isActiveNewsFilter = (filters: ReadingFilterState) =>
  NEWS_FILTER_KEYS.some(key => filters[key] !== 'all')

const valuesFor = (items: ReadingFilterItem[], key: NewsFilterKey) =>
  new Set(items.filter(item => item.kind === 'news').map(item => item[key]).filter(Boolean))

export const normalizeReadingFilters = (
  items: ReadingFilterItem[],
  filters: ReadingFilterState,
): ReadingFilterState => {
  const next = { ...filters }
  const newsItems = items.filter(item => item.kind === 'news')

  if (isActiveNewsFilter(next)) next.kind = 'news'
  if (next.kind !== 'news') {
    for (const key of NEWS_FILTER_KEYS) next[key] = 'all'
  }

  if (next.newsColumn !== 'all') {
    next.newsType = 'column'
    if (next.newsColumn === '春秋') next.newsSource = '日経'
    if (next.newsColumn === '天声人語') next.newsSource = '朝日'
  } else if (next.newsType !== 'all' && next.newsType !== 'column') {
    next.newsColumn = 'all'
  }

  for (const key of NEWS_FILTER_KEYS) {
    if (next[key] !== 'all' && !valuesFor(newsItems, key).has(next[key])) {
      next[key] = 'all'
    }
  }

  const availableYears = new Set(
    items
      .filter(item => next.kind === 'all' || item.kind === next.kind)
      .map(item => item.year)
      .filter(Boolean),
  )
  if (next.year !== 'all' && !availableYears.has(next.year)) next.year = 'all'

  next.page = Number.isFinite(next.page) && next.page > 0
    ? Math.floor(next.page)
    : 1
  return next
}

export const changeReadingFilter = (
  items: ReadingFilterItem[],
  current: ReadingFilterState,
  key: keyof ReadingFilterState,
  value: string | number,
): ReadingFilterState => {
  const next = { ...current, [key]: value, page: 1 }

  if (key === 'kind' && value !== 'news') {
    for (const newsKey of NEWS_FILTER_KEYS) next[newsKey] = 'all'
  }
  if (NEWS_FILTER_KEYS.includes(key as NewsFilterKey) && value !== 'all') {
    next.kind = 'news'
  }
  if (key === 'newsSource' && value !== 'all') {
    if (value === '日経' && next.newsColumn === '天声人語') next.newsColumn = 'all'
    if (value === '朝日' && next.newsColumn === '春秋') next.newsColumn = 'all'
  }
  if (key === 'newsType' && value !== 'column') next.newsColumn = 'all'
  if (key === 'newsColumn' && value !== 'all') {
    next.newsType = 'column'
    next.newsSource = value === '春秋' ? '日経' : '朝日'
  }

  return normalizeReadingFilters(items, next)
}

const matchesNewsFilters = (
  item: ReadingFilterItem,
  filters: ReadingFilterState,
  ignoredKey?: NewsFilterKey,
) => NEWS_FILTER_KEYS.every(key =>
  key === ignoredKey || filters[key] === 'all' || item[key] === filters[key],
)

export const buildFacetedNewsOptions = (
  items: ReadingFilterItem[],
  filters: ReadingFilterState,
) => Object.fromEntries(
  NEWS_FILTER_KEYS.map(key => [
    key,
    Array.from(new Set(
      items
        .filter(item =>
          item.kind === 'news' &&
          (filters.year === 'all' || item.year === filters.year) &&
          matchesNewsFilters(item, filters, key),
        )
        .map(item => item[key])
        .filter(Boolean),
    )),
  ]),
) as Record<NewsFilterKey, string[]>

export const serializeReadingFilters = (filters: ReadingFilterState) => {
  const params = new URLSearchParams()
  if (filters.query.trim()) params.set('q', filters.query.trim())
  if (filters.kind !== 'all') params.set('kind', filters.kind)
  if (filters.year !== 'all') params.set('year', filters.year)
  if (filters.sort !== 'newest') params.set('sort', filters.sort)
  if (filters.newsSource !== 'all') params.set('source', filters.newsSource)
  if (filters.newsType !== 'all') params.set('type', filters.newsType)
  if (filters.newsSection !== 'all') params.set('section', filters.newsSection)
  if (filters.newsColumn !== 'all') params.set('column', filters.newsColumn)
  if (filters.newsEdition !== 'all') params.set('edition', filters.newsEdition)
  if (filters.newsTopic !== 'all') params.set('topic', filters.newsTopic)
  if (filters.page > 1) params.set('page', String(filters.page))
  return params.toString()
}
