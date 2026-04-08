import { listListeningMaterialsForShadowing } from '@/lib/repositories/materials.repo'
import prisma from '@/lib/prisma'
import ShadowingListClient from '@/app/shadowing/ShadowingListClient'

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

  return <ShadowingListClient rows={rows} collections={collections} mode='manage' />
}
