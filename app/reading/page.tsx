import { getEbookSourceLabel, isEbookSourceKind } from '@/lib/ebooks/source-kind'
import { listReadingMaterials } from '@/lib/repositories/materials'
import ReadingCenterClient, {
  type ReadingCenterItem,
} from '@/modules/reading/components/ReadingCenterClient'
import {
  formatNewsDate,
  getNewsEditionLabel,
  getNewsTypeLabel,
  normalizeNewsMetadata,
} from '@/modules/reading/domain/news-metadata'
import { parseReadingFilters } from '@/modules/reading/domain/reading-filters'

export const revalidate = 0

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
  const [resolvedSearchParams, materials] = await Promise.all([
    searchParams,
    listReadingMaterials(),
  ])
  const initialFilters = parseReadingFilters(resolvedSearchParams)
  const frequencySource = materials.filter(
    item => !isEbookSourceKind(item.sourceKind),
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
      examLevel: exam ? item.paper?.level || '' : '',
      examPaper: exam ? item.paper?.id || '' : '',
      examPaperName: exam ? item.paper?.name || '未命名试卷' : '',
      paperOrder: exam ? item.paper?.sortOrder ?? order : order,
      chapterCount: item.chapterCount,
      questionCount: item.questionCount,
      order,
    }
  })

  return (
    <ReadingCenterClient
      items={items}
      frequencyMaterialCount={frequencySource.length}
      initialFilters={initialFilters}
    />
  )
}
