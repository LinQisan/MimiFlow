import ListeningListClient from '@/features/listening/ui/ListeningListClient'
import { listListeningMaterialsForShadowing } from '@/lib/repositories/materials'
import { listCollectionsByTypes } from '@/features/listening/server/repository'

export default async function ManageShadowingPage() {
  const [rows, collections] = await Promise.all([
    listListeningMaterialsForShadowing(),
    listCollectionsByTypes(['LIBRARY_ROOT', 'BOOK', 'CHAPTER']),
  ])

  return (
    <ListeningListClient
      rows={rows}
      collections={collections}
      mode='manage'
      workspace='shadowing'
    />
  )
}
