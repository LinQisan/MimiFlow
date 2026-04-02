'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { TodayTaskItem } from '@/app/actions/studyPlan'

type TodayPlanClientProps = {
  dateKey: string
  tasks: TodayTaskItem[]
  startHref: string
}

export default function TodayPlanClient({
  dateKey,
  tasks,
  startHref,
}: TodayPlanClientProps) {
  const storageKey = `mimiflow_today_plan_${dateKey}`
  const [doneTaskIds, setDoneTaskIds] = useState<string[]>([])

  useEffect(() => {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        setDoneTaskIds(parsed.filter(item => typeof item === 'string'))
      }
    } catch {
      // ignore broken local cache
    }
  }, [storageKey])

  const toggleDone = (taskId: string) => {
    setDoneTaskIds(prev => {
      const next = prev.includes(taskId)
        ? prev.filter(item => item !== taskId)
        : [...prev, taskId]
      localStorage.setItem(storageKey, JSON.stringify(next))
      return next
    })
  }

  const finishedCount = useMemo(
    () => tasks.filter(task => doneTaskIds.includes(task.id)).length,
    [doneTaskIds, tasks],
  )

  return (
    <main className='min-h-screen bg-gray-50 p-4 md:p-8'>
      <div className='mx-auto max-w-5xl'>
        <section className='border-b border-gray-200 pb-4 md:pb-6'>
          <div className='flex flex-wrap items-end justify-between gap-3'>
            <div>
              <h1 className='text-3xl font-black text-gray-900 md:text-4xl'>
                今日任务
              </h1>
              <p className='mt-2 text-sm text-gray-500'>
                日期 {dateKey} · 自动编排学习顺序，尽量减少手动选择成本。
              </p>
            </div>
            <div className='flex items-center gap-2'>
              <span className='ui-tag ui-tag-info'>
                完成 {finishedCount}/{tasks.length}
              </span>
              <Link
                href={startHref}
                className='ui-btn ui-btn-primary'>
                开始今日学习
              </Link>
            </div>
          </div>
        </section>

        <section className='mt-4 space-y-3'>
          {tasks.map((task, index) => {
            const done = doneTaskIds.includes(task.id)
            return (
              <article
                key={`today-task-${task.id}`}
                className='border-b border-gray-200 bg-white px-3 py-3 md:px-4 md:py-4'>
                <div className='flex flex-wrap items-center justify-between gap-3'>
                  <div className='min-w-0'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='ui-tag ui-tag-muted'>#{index + 1}</span>
                      <h2 className='text-lg font-bold text-gray-900'>{task.title}</h2>
                      <span className='ui-tag ui-tag-warn'>
                        {task.targetCount}
                        {task.unit}
                      </span>
                      {task.disabled && (
                        <span className='ui-tag ui-tag-muted'>当前不可执行</span>
                      )}
                    </div>
                    <p className='mt-1 text-sm text-gray-500'>{task.description}</p>
                  </div>
                  <div className='flex items-center gap-2'>
                    <button
                      type='button'
                      onClick={() => toggleDone(task.id)}
                      className={`ui-btn ui-btn-sm ${
                        done
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : ''
                      }`}>
                      {done ? '已完成' : '标记完成'}
                    </button>
                    {task.disabled ? (
                      <span className='ui-btn ui-btn-sm cursor-not-allowed opacity-50'>
                        去学习
                      </span>
                    ) : (
                      <Link
                        href={task.href}
                        className='ui-btn ui-btn-sm'>
                        去学习
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      </div>
    </main>
  )
}
