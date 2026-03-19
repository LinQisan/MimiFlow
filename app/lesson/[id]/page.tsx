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
  const group = getLessonGroupById(lesson.groupId)

  // 【新增】：做一个兜底校验，确保传给子组件的 group 绝对不是 undefined
  if (!group) {
    return (
      <div className='text-center mt-20 text-gray-500'>找不到所属的课程组</div>
    )
  }

  // 因为上面已经拦截了空值，这里可以直接安全地取 lessons
  const allGroupLessons = group.lessons

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
      {/* 【修改】：把获取到的 group 作为 lessonGroup 参数传给播放器 */}
      <AudioPlayer
        lesson={lesson}
        lessonGroup={group}
        prevId={prevId}
        nextId={nextId}
      />
    </main>
  )
}
