import ReadingListClient from '@/modules/reading/components/ReadingListClient'
import { isEbookSourceKind } from '@/lib/ebooks/source-kind'
import { listReadingMaterials } from '@/lib/repositories/materials'

const firstValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

export default async function ManageReadingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [params, rows] = await Promise.all([
    searchParams,
    listReadingMaterials(),
  ])

  return (
    <ReadingListClient
      rows={rows.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        author: item.author,
        sourceKind: item.sourceKind,
        publishedDate: item.publishedDate,
        edition: item.edition,
        newsColumn: item.newsColumn,
        newsSection: item.newsSection,
        kind: isEbookSourceKind(item.sourceKind) ? 'ebook' : 'article',
        chapterCount: item.chapterCount,
        questionCount: item.questionCount,
        paper: item.paper,
      }))}
      initialFilters={{
        query: firstValue(params.q) || '',
        status: firstValue(params.status) || 'all',
        kind: firstValue(params.kind) || 'all',
        paper: firstValue(params.paper) || 'all',
        page: Math.max(
          1,
          Number.parseInt(firstValue(params.page) || '1', 10) || 1,
        ),
      }}
    />
  )
}
