'use client'

import { useState } from 'react'
import Link from 'next/link'
import { LessonGroup } from '../data'

export default function CategoryAccordion({
  lessonGroups,
}: {
  lessonGroups: LessonGroup[]
}) {
  // 记录哪些组处于展开状态（使用 groupId 作为 key）
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  const toggleGroup = (groupId: string) => {
    setOpenGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  return (
    <div className='space-y-6'>
      {lessonGroups.map(group => {
        const isOpen = openGroups[group.categoryId]

        return (
          <div
            key={group.categoryId}
            className='flex flex-col gap-1 shadow-sm rounded-2xl'>
            {/* 1. 头部区域（点击展开/收起） */}
            <div
              onClick={() => toggleGroup(group.categoryId)}
              className={`bg-[#F8F9FA] p-6 cursor-pointer hover:bg-gray-100 transition-colors ${isOpen ? 'rounded-t-2xl' : 'rounded-2xl'}`}>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-3'>
                  <h2 className='text-2xl font-bold text-gray-800'>
                    {group.groupTitle}
                  </h2>
                  <span className='text-xs font-medium bg-white border border-gray-200 text-gray-500 px-3 py-1 rounded-full shadow-sm'>
                    共 {group.lessons.length} 篇
                  </span>
                </div>
                <button
                  className='p-1.5 bg-white border border-gray-200 rounded-full text-gray-500 shadow-sm transition-transform duration-300'
                  style={{
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}>
                  <svg
                    className='w-5 h-5'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'>
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M5 15l7-7 7 7'
                    />
                  </svg>
                </button>
              </div>

              {/* 左对齐的说明文字 */}
              {group.description && (
                <div className='mt-4'>
                  <p className='text-sm text-gray-600 leading-relaxed text-left'>
                    {group.description}
                  </p>
                </div>
              )}
            </div>

            {/* 2. 展开的课程列表区域（两列网格） */}
            <div
              className={`grid transition-all duration-300 ease-in-out ${
                isOpen
                  ? 'grid-rows-[1fr] opacity-100'
                  : 'grid-rows-[0fr] opacity-0'
              }`}>
              <div className='overflow-hidden'>
                <div className='p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white'>
                  {group.lessons.map(lesson => (
                    <Link
                      key={lesson.id}
                      href={`/lesson/${lesson.id}`}
                      className='flex items-center justify-between p-4 bg-gray-50 border border-gray-100 rounded-xl hover:bg-green-50 hover:border-green-200 transition-all duration-200 group'>
                      <div className='flex items-center gap-3'>
                        <div className='bg-white text-gray-400 p-2 rounded-full shadow-sm group-hover:text-green-500 transition-colors'>
                          <svg
                            className='w-4 h-4'
                            fill='currentColor'
                            viewBox='0 0 20 20'>
                            <path
                              fillRule='evenodd'
                              d='M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z'
                              clipRule='evenodd'
                            />
                          </svg>
                        </div>
                        <h3 className='text-md font-medium text-gray-700 group-hover:text-green-700 transition-colors'>
                          {lesson.title}
                        </h3>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
