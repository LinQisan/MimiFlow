import ListeningListClient from '@/app/(study)/listening/ListeningListClient'
import prisma from '@/lib/prisma'
import { listListeningMaterialsForShadowing } from '@/lib/repositories/materials'

export default async function ManageShadowingPage() {
  const [rows, collections] = await Promise.all([
    listListeningMaterialsForShadowing(),
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
    <ListeningListClient
      rows={rows}
      collections={collections}
      mode='manage'
      workspace='shadowing'
    />
  )
}
