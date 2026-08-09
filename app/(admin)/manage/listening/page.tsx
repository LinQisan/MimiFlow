// Listening management route.
import {
  listListeningLessonsForShadowing,
} from '@/lib/repositories/materials'
import prisma from '@/lib/prisma'
import ListeningListClient from '@/app/(study)/listening/ListeningListClient'

export default async function ManageListeningPage() {
  const [listeningRows, collections] = await Promise.all([
    listListeningLessonsForShadowing(),
    prisma.collection.findMany({
      where: {
        collectionType: 'PAPER',
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        title: true,
        collectionType: true,
        parentId: true,
        sortOrder: true,
      },
    }),
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
