import {
  listListeningLessonsForShadowing,
  listListeningMaterialsForShadowing,
} from '@/lib/repositories/materials'
import prisma from '@/lib/prisma'
import ShadowingListClient from '@/app/shadowing/ShadowingListClient'

export default async function ManageShadowingPage() {
  const [speakingRows, listeningRows, collections] = await Promise.all([
    listListeningMaterialsForShadowing(),
    listListeningLessonsForShadowing(),
    prisma.collection.findMany({
      where: {
        collectionType: { in: ['LIBRARY_ROOT', 'BOOK', 'CHAPTER'] as const },
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
    <ShadowingListClient
      rows={[...speakingRows, ...listeningRows]}
      collections={collections}
      mode='manage'
    />
  )
}
