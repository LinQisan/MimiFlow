import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findNewsCollectionId,
  formatNewsDate,
  isAutomaticMorningEdition,
  isAutomaticFrontPageSection,
  supportsBreakingEdition,
  normalizeNewsMetadata,
} from '../modules/reading/domain/news-metadata.ts'
import {
  buildFacetedNewsOptions,
  changeReadingFilter,
  DEFAULT_READING_FILTERS,
  parseReadingFilters,
  serializeReadingFilters,
} from '../modules/reading/domain/reading-filters.ts'


test('structured news metadata maps to source collections', () => {
  const collections = [
    { id: 'asahi', name: '天声人语' },
    { id: 'nikkei', name: '日経' },
  ]

  assert.equal(findNewsCollectionId(collections, { source: '朝日', column: '天声人語' }), 'asahi')
  assert.equal(findNewsCollectionId(collections, { source: '日経' }), 'nikkei')
  assert.equal(isAutomaticMorningEdition({ source: '朝日', type: 'column', column: '天声人語' }), true)
  assert.equal(isAutomaticMorningEdition({ source: '日経', type: 'column', column: '春秋' }), true)
  assert.equal(isAutomaticMorningEdition({ source: '日経', type: 'editorial', column: '' }), true)
  assert.equal(isAutomaticMorningEdition({ source: '朝日', type: 'editorial', column: '' }), false)
  assert.equal(isAutomaticMorningEdition({ source: '日経', type: 'news', column: '' }), false)
  assert.equal(isAutomaticFrontPageSection({ type: 'column', column: '春秋' }), true)
  assert.equal(isAutomaticFrontPageSection({ type: 'column', column: '天声人語' }), true)
  assert.equal(isAutomaticFrontPageSection({ type: 'news', column: '' }), false)
  assert.equal(supportsBreakingEdition({ source: '日経', type: 'news' }), true)
  assert.equal(supportsBreakingEdition({ source: '朝日', type: 'news' }), false)
  assert.deepEqual(normalizeNewsMetadata({ newsSource: '日経', newsType: 'editorial', newsSection: '総合' }), {
    source: '日経', type: 'editorial', section: '総合', column: '', topic: '',
  })
  assert.equal(formatNewsDate('2026-08-17'), '2026年8月17日')
})

test('reading filters keep news metadata consistent and restorable', () => {
  const items = [
    {
      kind: 'news', year: '2026', newsSource: '日経', newsType: 'column',
      newsSection: '一面', newsColumn: '春秋', newsEdition: 'MORNING', newsTopic: '経済',
    },
    {
      kind: 'news', year: '2025', newsSource: '朝日', newsType: 'column',
      newsSection: '一面', newsColumn: '天声人語', newsEdition: 'MORNING', newsTopic: '社会',
    },
    {
      kind: 'article', year: '2026', newsSource: '', newsType: '',
      newsSection: '', newsColumn: '', newsEdition: '', newsTopic: '',
    },
  ]

  const springColumn = changeReadingFilter(
    items,
    DEFAULT_READING_FILTERS,
    'newsColumn',
    '春秋',
  )
  assert.equal(springColumn.kind, 'news')
  assert.equal(springColumn.newsSource, '日経')
  assert.equal(springColumn.newsType, 'column')

  const asahi = changeReadingFilter(items, springColumn, 'newsSource', '朝日')
  assert.equal(asahi.newsColumn, 'all')
  assert.equal(asahi.newsSource, '朝日')

  const article = changeReadingFilter(items, asahi, 'kind', 'article')
  assert.equal(article.newsSource, 'all')
  assert.equal(article.newsType, 'all')

  const facets = buildFacetedNewsOptions(items, {
    ...DEFAULT_READING_FILTERS,
    kind: 'news',
    newsSource: '日経',
  })
  assert.deepEqual(facets.newsColumn, ['春秋'])
  assert.deepEqual(facets.newsTopic, ['経済'])

  const restored = parseReadingFilters({
    q: '教育', kind: 'news', source: '朝日', page: '2', sort: 'oldest',
  })
  assert.equal(
    serializeReadingFilters(restored),
    'q=%E6%95%99%E8%82%B2&kind=news&sort=oldest&source=%E6%9C%9D%E6%97%A5&page=2',
  )
})
