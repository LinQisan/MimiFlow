// 文件路径：components/CategoryAccordion.tsx
'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Lesson } from '../data'

// 定义传入的数据类型 (附带从数组中映射出的 id)
type LessonWithId = Lesson & { id: string }

interface Props {
  groupedLessons: Record<string, LessonWithId[]>
}

export default function CategoryAccordion({ groupedLessons }: Props) {
  const groupNames = Object.keys(groupedLessons)

  // 记录当前展开的是哪个分组。默认展开第一个分组。
  const [openGroup, setOpenGroup] = useState<string | null>(
    groupNames[0] || null,
  )

  const toggleGroup = (groupName: string) => {
    // 如果点击的是当前已展开的，就收起（设为 null）；否则展开点击的这个
    setOpenGroup(prev => (prev === groupName ? null : groupName))
  }

  return (
    <div className='space-y-4'>
      {groupNames.map(groupName => {
        const lessons = groupedLessons[groupName]
        const isOpen = openGroup === groupName

        return (
          <div
            key={groupName}
            className='bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden transition-all duration-200'>
            {/* 折叠面板头部 (点击区域) */}
            <button
              onClick={() => toggleGroup(groupName)}
              className='w-full flex items-center justify-between p-5 bg-gray-50 hover:bg-gray-100 transition-colors'>
              <div className='flex items-center gap-3'>
                <h2 className='text-xl font-bold text-gray-800'>{groupName}</h2>
                <span className='text-xs font-medium bg-white border border-gray-200 text-gray-500 px-3 py-1 rounded-full shadow-sm'>
                  共 {lessons.length} 篇
                </span>
              </div>

              {/* 旋转的小箭头 */}
              <div
                className={`p-1 rounded-full bg-white shadow-sm transition-transform duration-300 ${isOpen ? '-rotate-180' : 'rotate-0'}`}>
                <svg
                  className='w-5 h-5 text-gray-500'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='currentColor'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M19 9l-7 7-7-7'
                  />
                </svg>
              </div>
            </button>

            {/* 折叠面板内容区域 (平滑展开动画) */}
            <div
              className={`grid transition-all duration-300 ease-in-out ${
                isOpen
                  ? 'grid-rows-[1fr] opacity-100'
                  : 'grid-rows-[0fr] opacity-0'
              }`}>
              <div className='overflow-hidden'>
                <div className='p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white'>
                  {lessons.map(lesson => (
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
