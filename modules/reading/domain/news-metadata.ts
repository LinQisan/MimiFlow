export type NewsSource = '' | '日経' | '朝日'
export type NewsType = '' | 'news' | 'editorial' | 'column'
export type NewsColumn = '' | '春秋' | '天声人語'
export type NewsEdition = '' | 'MORNING' | 'EVENING' | 'FLASH'

export const NEWS_SOURCE_OPTIONS = [
  { value: '日経', label: '日経' },
  { value: '朝日', label: '朝日' },
] as const

export const NEWS_TYPE_OPTIONS = [
  { value: 'news', label: '普通新闻', description: '一般报道' },
  { value: 'editorial', label: '社説', description: '报社评论' },
  { value: 'column', label: '专栏', description: '春秋或天声人語' },
] as const

export const NEWS_SECTION_OPTIONS = ['一面', '総合', '経済', '国際', '社会', '政治', '文化', '科学', 'スポーツ', '速報']
export const NEWS_EDITION_OPTIONS = [
  { value: 'MORNING', label: '朝刊' },
  { value: 'EVENING', label: '夕刊' },
  { value: 'FLASH', label: '速報' },
] as const
export const NEWS_TOPIC_OPTIONS = ['AI', '教育', '経済', '国際', '社会', '政治', '環境', '科学', '文化']
export const NEWS_COLUMN_OPTIONS = [
  { value: '春秋', source: '日経' },
  { value: '天声人語', source: '朝日' },
] as const

export const getNewsTypeLabel = (type: NewsType) =>
  NEWS_TYPE_OPTIONS.find(item => item.value === type)?.label || ''

export const isAutomaticMorningEdition = (metadata: {
  source: NewsSource
  type: NewsType
  column: NewsColumn
}) =>
  (metadata.type === 'column' && ['春秋', '天声人語'].includes(metadata.column)) ||
  (metadata.type === 'editorial' && metadata.source === '日経')

export const isAutomaticFrontPageSection = (metadata: {
  type: NewsType
  column: NewsColumn
}) => metadata.type === 'column' && ['春秋', '天声人語'].includes(metadata.column)

export const supportsBreakingEdition = (metadata: {
  source: NewsSource
  type: NewsType
}) => metadata.source === '日経' && metadata.type === 'news'

export const getNewsEditionLabel = (edition: string) =>
  NEWS_EDITION_OPTIONS.find(item => item.value === edition)?.label || ''

export const normalizeNewsMetadata = (input: {
  newsSource?: string | null
  newsType?: string | null
  newsSection?: string | null
  newsColumn?: string | null
  newsTopic?: string | null
  collectionName?: string | null
}) => {
  const collectionSource: NewsSource = /日経|日本経済新聞/.test(input.collectionName || '')
    ? '日経'
    : /朝日|天声人[語语]/.test(input.collectionName || '')
      ? '朝日'
      : ''
  const source = (['日経', '朝日'].includes(input.newsSource || '')
    ? input.newsSource
    : collectionSource) as NewsSource
  const type = (['news', 'editorial', 'column'].includes(input.newsType || '')
    ? input.newsType
    : '') as NewsType
  const column = (['春秋', '天声人語'].includes(input.newsColumn || '')
    ? input.newsColumn
    : '') as NewsColumn

  return {
    source,
    type,
    section: (input.newsSection || '').trim(),
    column,
    topic: (input.newsTopic || '').trim(),
  }
}

export const findNewsCollectionId = <T extends { id: string; name: string }>(
  collections: T[],
  metadata: { source: NewsSource; column?: NewsColumn },
) => {
  const patterns = metadata.source === '日経'
    ? [/^日経$/, /日本経済新聞/, /日経/]
    : metadata.source === '朝日' && metadata.column === '天声人語'
      ? [/天声人[語语]/, /朝日/]
      : metadata.source === '朝日'
        ? [/^朝日(?:新聞)?$/, /朝日/, /天声人[語语]/]
        : []
  return collections.find(collection => patterns.some(pattern => pattern.test(collection.name)))?.id || ''
}

export const formatNewsDate = (value: string) => {
  const match = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!match) return value.trim()
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`
}

export const todayForDateInput = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
