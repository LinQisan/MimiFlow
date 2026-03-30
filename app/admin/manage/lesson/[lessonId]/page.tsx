// app/admin/manage/lesson/[lessonId]/page.tsx
import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import Link from 'next/link'
import DialogueRow from './DialogueRow'

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})
const prisma = new PrismaClient({ adapter })

export default async function LessonEditPage({
  params,
}: {
  params: Promise<{ lessonId: string }>
}) {
  const { lessonId } = await params

  // 查出这节课的信息，以及它所有的字幕（按顺序排好）
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      category: true,
      dialogues: {
        orderBy: { start: 'asc' }, // 按时间轴先后排序
      },
    },
  })

  if (!lesson) return <div className='text-center mt-20'>找不到该课程</div>

  return (
    <main className='min-h-screen bg-gray-50 p-8'>
      <div className='max-w-4xl mx-auto mt-10'>
        <Link
          href='/admin/manage'
          className='text-sm text-indigo-500 hover:text-indigo-700 mb-6 inline-block'>
          &larr; 返回管理中心
        </Link>

        <div className='bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mb-6'>
          <h1 className='text-2xl font-bold text-gray-800 mb-2'>
            <span className='text-indigo-500 mr-2'>{lesson.lessonNum}</span>
            {lesson.title}
          </h1>
          <p className='text-sm text-gray-500'>
            所属试卷: {lesson.category.name}
          </p>
          <p className='text-sm text-gray-500 mt-1 font-mono bg-gray-100 inline-block px-2 py-1 rounded'>
            音频路径: {lesson.audioFile}
          </p>
        </div>

        <div className='bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden'>
          <div className='p-4 bg-gray-50 border-b border-gray-200 text-sm font-bold text-gray-600 flex'>
            <div className='w-32 text-right mr-4 shrink-0'>时间轴 (秒)</div>
            <div>字幕文本内容</div>
          </div>

          <div className='p-2 space-y-1'>
            {lesson.dialogues.length === 0 ? (
              <div className='text-center py-10 text-gray-400'>
                暂无字幕数据
              </div>
            ) : (
              lesson.dialogues.map(dialogue => (
                <DialogueRow key={dialogue.id} dialogue={dialogue} />
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
