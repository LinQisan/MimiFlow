// Listening management route.
import {
  listListeningLessonsForShadowing,
} from '@/lib/repositories/materials'
import ListeningListClient from '@/features/listening/ui/ListeningListClient'
import { listCollectionsByTypes } from '@/features/listening/server/repository'

export default async function ManageListeningPage() {
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
    />
  )
}
