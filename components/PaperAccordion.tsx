'use client'

import Link from 'next/link'

type LessonItem = {
  id: string
  title: string
}

type PaperItem = {
  id: string
  name: string
  description: string | null
  lessons: LessonItem[]
}

export default function PaperAccordion({ papers }: { papers: PaperItem[] }) {
  return (
    <div className='space-y-6'>
      {papers.map(paper => (
        <section
          key={paper.id}
          className='border-b border-gray-200 pb-5 md:pb-6'>
          <div className='mb-4 flex items-center justify-between gap-3'>
            <h2 className='text-xl font-semibold text-gray-800 md:text-2xl'>
              {paper.name}
            </h2>
            <span className='px-1 py-1 text-xs font-semibold text-gray-500'>
              {paper.lessons.length} 篇
            </span>
          </div>

          {paper.description && (
            <p className='mb-5 text-sm leading-relaxed text-gray-500'>
              {paper.description}
            </p>
          )}

          <div className='grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3'>
            {paper.lessons.map((lesson, index) => (
              <Link
                key={lesson.id}
                href={`/shadowing/${lesson.id}`}
                className='group flex items-center justify-between border-b border-gray-200 p-3 transition-colors hover:bg-gray-50'>
                <div className='min-w-0'>
                  <p className='mb-1 text-sm font-semibold text-indigo-500'>
                    第 {index + 1} 课
                  </p>
                  <h3 className='truncate text-base font-semibold text-gray-800 group-hover:text-indigo-700'>
                    {lesson.title}
                  </h3>
                </div>
                <span className='text-lg text-gray-300 transition-colors group-hover:text-indigo-500'>
                  →
                </span>
              </Link>
            ))}
          </div>

          {paper.lessons.length === 0 && (
            <div className='border-b border-dashed border-gray-200 bg-gray-50/80 py-6 text-center text-sm text-gray-400'>
              当前试卷暂无课程
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
