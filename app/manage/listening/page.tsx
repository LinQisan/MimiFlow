// Listening management route.
import {
  listListeningLessonsForShadowing,
} from '@/lib/repositories/materials'
import ListeningListClient from '@/modules/listening/components/ListeningListClient'
import { listCollectionsByTypes } from '@/modules/listening/server/repository'

export default async function ManageListeningPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>
}) {
  const resolvedSearchParams = await searchParams
  const pageValue = Array.isArray(resolvedSearchParams.page)
    ? resolvedSearchParams.page[0]
    : resolvedSearchParams.page
  const initialManagePage = Math.max(1, Number.parseInt(pageValue || '1', 10) || 1)
  const [listeningRows, collections] = await Promise.all([
    listListeningLessonsForShadowing(),
    listCollectionsByTypes(['PAPER']),
  ])

  return (
    <ListeningListClient
      rows={listeningRows}
      collections={collections}
      mode='manage'
      workspace='listening'
      initialManagePage={initialManagePage}
    />
  )
}
