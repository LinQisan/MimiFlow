'use client'

import Link from 'next/link'

type DB_Lesson = {
  id: string
  title: string
}

type DB_Category = {
  id: string
  name: string
  description: string | null
  lessons: DB_Lesson[]
}

export default function CategoryAccordion({
  lessonGroups,
}: {
  lessonGroups: DB_Category[]
}) {
  return (
    <div className='space-y-6'>
      {lessonGroups.map(group => {
        return (
          <section
            key={group.id}
            className='border-b border-gray-200 pb-5 md:pb-6'>
            <div className='flex items-center justify-between gap-3 mb-4'>
              <h2 className='text-xl md:text-2xl font-semibold text-gray-800'>
                {group.name}
              </h2>
              <span className='text-xs font-semibold text-gray-500 px-1 py-1'>
                {group.lessons.length} 篇
              </span>
            </div>

            {group.description && (
              <p className='text-sm text-gray-500 leading-relaxed mb-5'>
                {group.description}
              </p>
            )}

            <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4'>
              {group.lessons.map((lesson, index) => (
                <Link
                  key={lesson.id}
                  href={`/lessons/${lesson.id}`}
                  className='group flex items-center justify-between border-b border-gray-200 p-3 hover:bg-gray-50 transition-colors'>
                  <div className='min-w-0'>
                    <p className='text-sm font-semibold text-indigo-500 mb-1'>
                      第 {index + 1} 课
                    </p>
                    <h3 className='text-base font-semibold text-gray-800 group-hover:text-indigo-700 truncate'>
                      {lesson.title}
                    </h3>
                  </div>
                  <span className='text-lg text-gray-300 group-hover:text-indigo-500 transition-colors'>
                    →
                  </span>
                </Link>
              ))}
            </div>

            {group.lessons.length === 0 && (
              <div className='text-sm text-gray-400 py-6 text-center border-b border-dashed border-gray-200 bg-gray-50/80'>
                当前分组暂无课程
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
