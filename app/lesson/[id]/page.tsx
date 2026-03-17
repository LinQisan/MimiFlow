// 文件路径：app/lesson/[id]/page.tsx
import { getLessonById, getLessonsByCategory } from '../../../data'
import AudioPlayer from '../../../components/AudioPlayer'

export default async function LessonPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const lesson = getLessonById(id)

  if (!lesson) {
    return <div className='text-center mt-20 text-gray-500'>找不到该课程</div>
  }

  // 1. 获取同分类下的所有题目
  const allCategoryLessons = getLessonsByCategory(lesson.categoryId)

  // 2. 找到当前题目在数组里的索引位置
  const currentIndex = allCategoryLessons.findIndex(l => l.id === id)

  // 3. 计算上一题和下一题的 ID（如果是第一题，上一题就是 null）
  const prevId =
    currentIndex > 0 ? allCategoryLessons[currentIndex - 1].id : null
  const nextId =
    currentIndex < allCategoryLessons.length - 1
      ? allCategoryLessons[currentIndex + 1].id
      : null

  return (
    <main className='min-h-screen bg-white'>
      {/* 把计算好的 id 传给播放器 */}
      <AudioPlayer lesson={lesson} prevId={prevId} nextId={nextId} />
    </main>
  )
}
