import PaperAccordion from '../../../components/PaperAccordion'
import prisma from '@/lib/prisma'

export default async function LevelPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const levelData = await prisma.level.findUnique({
    where: { id },
    include: {
      papers: {
        orderBy: { sortOrder: 'asc' },
        include: {
          lessons: {
            select: { id: true, title: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
    },
  })

  if (!levelData) {
    return <div className='text-center mt-20 text-gray-500'>找不到该分类</div>
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
