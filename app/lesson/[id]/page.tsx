import { getLessonById, getLessonGroupById } from '../../../data'
import AudioPlayer from '../../../components/AudioPlayer'

export default async function LessonPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const lesson = getLessonById(id)

  if (!lesson) {
    return <div className='text-center mt-20 text-gray-500'>找不到该课</div>
  }

  // 1. 获取该课程所属的整个 Unit/Group
  // （假设你的 lesson.categoryId 对应的值就是 lessonData 里的外层键名/groupId）
  const group = getLessonGroupById(lesson.groupId)

  // 提取出同组的所有课程列表（做个兜底防空）
  const allGroupLessons = group ? group.lessons : []

  // 2. 找到当前题目在数组里的索引位置
  const currentIndex = allGroupLessons.findIndex(l => l.id === id)

  // 3. 计算上一题和下一题的 ID
  const prevId = currentIndex > 0 ? allGroupLessons[currentIndex - 1].id : null
  const nextId =
    currentIndex >= 0 && currentIndex < allGroupLessons.length - 1
      ? allGroupLessons[currentIndex + 1].id
      : null

  return (
    <main className='min-h-screen bg-white'>
      {/* 把计算好的 id 传给播放器 */}
      <AudioPlayer lesson={lesson} prevId={prevId} nextId={nextId} />
    </main>
  )
}
