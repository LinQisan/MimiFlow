import ListeningListClient from '@/modules/listening/components/ListeningListClient'
import { listListeningMaterialsForShadowing } from '@/lib/repositories/materials'
import { listCollectionsByTypes } from '@/modules/listening/server/repository'

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
