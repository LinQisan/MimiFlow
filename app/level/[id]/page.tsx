import PaperAccordion from '../../../components/PaperAccordion'
import { CollectionType, MaterialType } from '@prisma/client'
import prisma from '@/lib/prisma'
import { toLegacyMaterialId } from '@/lib/repositories/materials.repo'

export default async function LevelPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const collection = await prisma.collection.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      collectionType: true,
      materials: {
        orderBy: { sortOrder: 'asc' },
        select: {
          material: {
            select: { id: true, title: true, type: true },
          },
        },
      },
    },
  })

  if (!collection || collection.collectionType !== CollectionType.PAPER) {
    return <div className='text-center mt-20 text-gray-500'>找不到该分类</div>
  }

  const listeningLessons = collection.materials
    .map(item => item.material)
    .filter(item => item.type === MaterialType.LISTENING)
    .map(item => ({
      id: toLegacyMaterialId(item.id),
      title: item.title,
    }))

  const levelData = {
    title: collection.title,
    description: null as string | null,
    papers: [
      {
        id: collection.id,
        name: collection.title,
        description: null,
        lessons: listeningLessons,
      },
    ],
  }

  return (
    <main className='min-h-screen bg-gray-50 px-4 py-6 md:px-8 md:py-8 xl:px-10'>
      <div className='mx-auto w-full max-w-7xl'>
        <header className='mb-8 border-b border-gray-200 pb-3 md:mb-10 md:pb-4'>
          <h1 className='mb-2 text-3xl font-bold tracking-tight text-gray-900 md:text-4xl'>
            {levelData.title}
          </h1>
          {levelData.description && (
            <p className='max-w-3xl text-gray-500'>{levelData.description}</p>
          )}
        </header>

        {levelData.papers.length > 0 ? (
          <PaperAccordion papers={levelData.papers} />
        ) : (
          <div className='border-b border-dashed border-gray-300 py-16 text-center text-gray-500'>
            该分类下暂时没有材料
          </div>
        )}
      </div>
    </main>
  )
}
