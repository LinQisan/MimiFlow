import { buildWordFrequency, type SudachiToken } from '@/features/reading/domain/sudachi'
import { getSudachiPronunciationMap } from '@/features/reading/server/sudachi-pronunciation'
import { getEbookSourceLabel, isEbookSourceKind } from '@/lib/ebooks/source-kind'
import { listReadingMaterials } from '@/lib/repositories/materials'
import type { FrequencyMaterial } from '@/features/reading/ui/WordFrequencyDialog'
import ReadingCenterClient, { type ReadingCenterItem } from './ReadingCenterClient'
import {
  formatNewsDate,
  getNewsEditionLabel,
  getNewsTypeLabel,
  normalizeNewsMetadata,
} from '@/features/reading/domain/news-metadata'
import { parseReadingFilters } from '@/features/reading/domain/reading-filters'

export const revalidate = 0

const summarize = (value: string | null, fallback: string) => {
  const normalized = (value || fallback).replace(/\s+/g, ' ').trim()
  return normalized.length > 120 ? `${normalized.slice(0, 116)}…` : normalized
}

const extractYear = (...values: Array<string | null | undefined>) => {
  for (const value of values) {
    const match = value?.match(/(?:19|20)\d{2}/)
    if (match) return match[0]
  }
  return ''
}

export default async function ReadingCenterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const initialFilters = parseReadingFilters(await searchParams)
  const materials = await listReadingMaterials()
  const frequencySource = materials.filter(
    item => !isEbookSourceKind(item.sourceKind),
  )
  const analysis = await getSudachiPronunciationMap(
    frequencySource.map(item => item.content),
  )
  const tokensByMaterial = analysis.tokens.reduce<Map<number, SudachiToken[]>>(
    (index, token) => {
      const rows = index.get(token.textIndex) || []
      rows.push(token)
      index.set(token.textIndex, rows)
      return index
    },
    new Map(),
  )

  const items: ReadingCenterItem[] = materials.map((item, order) => {
    const ebook = isEbookSourceKind(item.sourceKind)
    const exam = item.paper?.collectionType === 'PAPER'
    const kind: ReadingCenterItem['kind'] = ebook
      ? 'ebook'
      : item.sourceKind === 'NEWS'
        ? 'news'
        : exam
          ? 'exam'
          : 'article'
    const year = extractYear(
      item.publishedDate,
      item.paper?.name,
      item.title,
    )
    const news = normalizeNewsMetadata({
      ...item,
      collectionName: item.paper?.name,
    })
    const newsEditionLabel = getNewsEditionLabel(item.edition)
    const sourceLabel = ebook
      ? [getEbookSourceLabel(item.sourceKind), item.author, year]
          .filter(Boolean)
          .join(' · ')
      : kind === 'news'
        ? [
            news.source || item.paper?.name || '新闻',
            formatNewsDate(item.publishedDate),
            news.type === 'column' ? news.column : getNewsTypeLabel(news.type),
            newsEditionLabel,
            news.section === newsEditionLabel ? '' : news.section,
            news.topic,
          ]
            .filter(Boolean)
            .join(' · ')
        : [item.paper?.name || (kind === 'exam' ? '真题文章' : '独立文章'), year]
            .filter(Boolean)
            .join(' · ')

    return {
      id: item.id,
      title: item.title,
      shortTitle: item.shortTitle,
      hasAuthenticTitle: item.hasAuthenticTitle,
      summary: summarize(
        item.description,
        item.author || item.content || '暂无摘要',
      ),
      kind,
      year,
      publishedDate: item.publishedDate,
      sourceLabel,
      newsSource: news.source,
      newsType: news.type,
      newsSection: news.section,
      newsColumn: news.column,
      newsEdition: item.edition,
      newsTopic: news.topic,
      progress: Math.round(item.progress?.percent || 0),
      chapterCount: item.chapterCount,
      questionCount: item.questionCount,
      order,
    }
  })

  const frequencyMaterials: FrequencyMaterial[] = frequencySource.map(
    (item, textIndex) => ({
      id: item.id,
      kind:
        item.sourceKind === 'NEWS'
          ? 'news'
          : item.paper?.collectionType === 'PAPER'
            ? 'exam'
            : 'article',
      year: extractYear(item.publishedDate, item.paper?.name, item.title),
      rows: buildWordFrequency(tokensByMaterial.get(textIndex) || []),
    }),
  )

  return (
    <ReadingCenterClient
      items={items}
      frequencyMaterials={frequencyMaterials}
      initialFilters={initialFilters}
    />
  )
}
