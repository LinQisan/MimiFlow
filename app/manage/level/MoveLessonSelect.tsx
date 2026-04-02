'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { moveLesson } from './action'
import { useDialog } from '@/context/DialogContext'

type CategoryOption = {
  id: string
  name: string
  levelTitle: string
}

export default function MoveLessonSelect({
  lessonId,
  currentCategoryId,
  allCategories,
}: {
  lessonId: string
  currentCategoryId: string
  allCategories: CategoryOption[]
}) {
  const dialog = useDialog()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleOutside)
    }
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  const handleMove = async (targetCategoryId: string) => {
    if (!targetCategoryId || targetCategoryId === currentCategoryId) return

    const confirmMove = await dialog.confirm('确定要将该听力移动到新分组吗？', {
      title: '移动确认',
      confirmText: '移动',
    })
    if (confirmMove) {
      startTransition(async () => {
        const res = await moveLesson(lessonId, targetCategoryId)
        if (!res.success) await dialog.alert(res.message)
      })
      setOpen(false)
    }
  }

  const currentLabel = useMemo(() => {
    const found = allCategories.find(item => item.id === currentCategoryId)
    return found ? `${found.levelTitle} · ${found.name}` : '当前分组'
  }, [allCategories, currentCategoryId])

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return allCategories.filter(item => {
      if (!keyword) return true
      return `${item.levelTitle} ${item.name}`.toLowerCase().includes(keyword)
    })
  }, [allCategories, search])

  return (
    <div ref={wrapRef} className='relative w-full md:w-auto'>
      <button
        type='button'
        disabled={isPending}
        onClick={() => setOpen(prev => !prev)}
        className={`inline-flex w-full items-center justify-between gap-2 border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-indigo-200 hover:bg-indigo-50 md:w-auto ${
          isPending ? 'cursor-not-allowed opacity-50' : ''
        }`}>
        <span className='truncate'>移动分组</span>
        <svg
          className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? 'rotate-180 text-indigo-500' : ''}`}
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'>
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2.5}
            d='M19 9l-7 7-7-7'
          />
        </svg>
      </button>

      {open && (
        <div className='absolute left-0 z-[80] mt-2 w-[min(92vw,18rem)] border border-gray-200 bg-white p-2 md:left-auto md:right-0 md:w-72'>
          <p className='mb-1 px-1 text-[11px] font-semibold text-gray-500'>
            当前：{currentLabel}
          </p>
          <input
            value={search}
            onChange={e => setSearch(e.currentTarget.value)}
            placeholder='搜索分组'
            className='mb-2 w-full border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100'
          />
          <div className='max-h-56 space-y-1 overflow-y-auto'>
            {filtered.map(item => {
              const active = item.id === currentCategoryId
              return (
                <button
                  key={item.id}
                  type='button'
                  disabled={active}
                  onClick={() => void handleMove(item.id)}
                  className={`w-full px-2.5 py-2 text-left text-xs transition ${
                    active
                      ? 'cursor-default bg-indigo-50 font-semibold text-indigo-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}>
                  <p className='font-semibold'>{item.name}</p>
                  <p className='mt-0.5 text-[11px] text-gray-500'>{item.levelTitle}</p>
                </button>
              )
            })}
            {filtered.length === 0 && (
              <p className='px-2 py-3 text-xs text-gray-400'>无匹配分组</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
