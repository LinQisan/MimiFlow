import AudioPlayer from '../../../components/AudioPlayer'
import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

export default async function LessonPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const lessonData = await prisma.lesson.findUnique({
    where: { id: id },
    include: {
      category: {
        include: {
          lessons: {
            select: {
              id: true,
              lessonNum: true,
              title: true,
            },
            orderBy: {
              lessonNum: 'asc',
            },
          },
        },
      },
      dialogues: {
        orderBy: {
          sequenceId: 'asc',
        },
      },
    },
  })

  if (!lessonData) {
    return <div className='text-center mt-20 text-gray-500'>找不到该课</div>
  }

  // 1. 获取该课程所属的整个 Unit/Group
  const lessonIds = lessonData.category.lessons.map(item => item.id)
  const currentIndex = lessonIds.findIndex(id => id === lessonData.id)

  const prevId = currentIndex > 0 ? lessonIds[currentIndex - 1] : null
  const nextId =
    currentIndex < lessonIds.length - 1 ? lessonIds[currentIndex + 1] : null

  // 把 Prisma 数据整理成 AudioPlayer 需要的形状
  const lesson = {
    id: lessonData.id,
    lessonNum: lessonData.lessonNum,
    title: lessonData.title,
    audioFile: lessonData.audioFile,
    dialogue: lessonData.dialogues.map(item => ({
      id: item.id,
      text: item.text,
      start: item.start,
      end: item.end,
    })),
  }

  const lessonGroup = {
    id: lessonData.category.id,
    name: lessonData.category.name,
    description: lessonData.category.description,
    levelId: lessonData.category.levelId,
  }

  // 【新增】：做一个兜底校验，确保传给子组件的 group 绝对不是 undefined
  if (!lesson) {
    return (
      <div className='text-center mt-20 text-gray-500'>找不到所属的课程组</div>
    )
  }

  return (
    <main className='min-h-screen bg-white'>
      {/* 【修改】：把获取到的 group 作为 lessonGroup 参数传给播放器 */}
      <AudioPlayer
        lesson={lesson}
        lessonGroup={lessonGroup}
        prevId={prevId}
        nextId={nextId}
      />
    </main>
  )
}
