// 文件路径：app/lesson/[id]/page.tsx
import { getLessonById } from '../../../data'
import AudioPlayer from '../../../components/AudioPlayer'

// 1. 函数前面加上 async
// 2. 类型定义改为 Promise
export default async function LessonPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  // 3. 使用 await 解析出真正的 id
  const { id } = await params

  const lesson = getLessonById(id)

  if (!lesson) {
    return (
      <div className='text-center mt-20 text-2xl text-gray-500'>
        找不到该课程，请检查网址。
        <br />
        <span className='text-sm text-gray-400'>
          当前系统接收到的 ID 是: {id || '空'}
        </span>
      </div>
    )
  }

  return (
    <main className='min-h-screen bg-white'>
      <AudioPlayer lesson={lesson} />
    </main>
  )
}
