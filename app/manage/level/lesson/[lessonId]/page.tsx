// app/admin/manage/lesson/[lessonId]/page.tsx
import Link from 'next/link'
import DialogueRow from './DialogueRow'
import prisma from '@/lib/prisma'
import EditableTitle from './EditableTitle'

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
      paper: true,
      dialogues: {
        orderBy: { start: 'asc' }, // 按时间轴先后排序
      },
    },
  })

  if (!lesson) return <div className='text-center mt-20'>找不到该课程</div>

  return (
    <main className='min-h-screen bg-gray-50 px-3 py-4 md:px-8 md:py-8'>
      <div className='mx-auto max-w-6xl'>
        <Link
          href={`/manage/level/${lesson.paper.levelId}`}
          className='mb-4 inline-block text-xs font-semibold text-indigo-600 hover:text-indigo-700 md:mb-6 md:text-sm'>
          返回分类
        </Link>

        <section className='mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:mb-6 md:p-6'>
          <EditableTitle lessonId={lesson.id} initialTitle={lesson.title} />
          <p className='text-xs text-gray-500 md:text-sm'>
            所属分组：{lesson.paper.name}
          </p>
          <p className='mt-2 inline-block rounded-md bg-gray-100 px-2 py-1 font-mono text-[11px] text-gray-500 break-all md:text-xs'>
            音频：{lesson.audioFile}
          </p>
        </section>

        <section className='overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm'>
          <div className='hidden border-b border-gray-200 bg-gray-50 p-4 text-sm font-bold text-gray-600 md:flex'>
            <div className='w-32 text-right mr-4 shrink-0'>时间轴 (秒)</div>
            <div>字幕文本内容</div>
          </div>

          <div className='space-y-2 p-2 md:space-y-1.5 md:p-3'>
            {lesson.dialogues.length === 0 ? (
              <div className='text-center py-10 text-gray-400'>
                暂无字幕数据
              </div>
            ) : (
              lesson.dialogues.map(dialogue => (
                <DialogueRow
                  key={dialogue.id}
                  dialogue={dialogue}
                  audioFile={lesson.audioFile}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
