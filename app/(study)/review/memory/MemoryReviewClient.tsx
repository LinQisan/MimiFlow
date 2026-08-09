'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Rating } from 'ts-fsrs'

import {
  rateSentenceFluency,
  rateVocabularyMemory,
} from '@/modules/review/actions/memory'
import type { MemoryReviewItem } from '@/modules/review/server/queries'

const RATINGS = [
  { value: Rating.Again, label: '忘记', className: 'border-red-200 text-red-700' },
  { value: Rating.Hard, label: '困难', className: 'border-amber-200 text-amber-700' },
  { value: Rating.Good, label: '记得', className: 'border-emerald-200 text-emerald-700' },
  { value: Rating.Easy, label: '熟练', className: 'border-blue-200 text-blue-700' },
]

export default function MemoryReviewClient({
  initialItems,
}: {
  initialItems: MemoryReviewItem[]
}) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [total] = useState(initialItems.length)
  const [revealed, setRevealed] = useState(false)
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const current = items[0]

  if (!current) {
    return (
      <section className='rounded-[1.75rem] border border-slate-200 bg-white p-8 text-center shadow-sm'>
        <h1 className='text-2xl font-black text-slate-900'>今日记忆复习已完成</h1>
        <p className='mt-2 text-sm text-slate-600'>没有更多到期的单词或句子。</p>
        <div className='mt-6 flex flex-wrap justify-center gap-2'>
          <Link href='/review' className='ui-btn ui-btn-primary'>
            返回复习中心
          </Link>
          <Link href='/practice/custom' className='ui-btn'>
            去做新题
          </Link>
        </div>
      </section>
    )
  }

  const rate = (rating: Rating) => {
    if (isPending) return
    setMessage('')
    startTransition(async () => {
      const result =
        current.kind === 'sentence'
          ? await rateSentenceFluency(current.id, rating)
          : await rateVocabularyMemory(current.vocabularyId, rating)
      if (!result.success) {
        setMessage(result.message || '保存失败')
        return
      }
      setItems(previous => previous.slice(1))
      setRevealed(false)
      router.refresh()
    })
  }

  return (
    <section className='rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8'>
      <div className='flex items-center justify-between gap-3'>
        <span className='rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600'>
          {current.kind === 'sentence' ? '句子' : '单词'}
        </span>
        <span className='text-xs text-slate-500'>剩余 {items.length}</span>
      </div>
      <div
        className='mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100'
        role='progressbar'
        aria-label={`记忆复习进度 已完成 ${total - items.length} / ${total}`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={total - items.length}>
        <div
          className='h-full rounded-full bg-slate-900 transition-[width]'
          style={{
            width: `${total > 0 ? ((total - items.length) / total) * 100 : 100}%`,
          }}
        />
      </div>

      <div className='flex min-h-64 flex-col items-center justify-center py-8 text-center'>
        <h2 className='text-3xl font-black leading-relaxed text-slate-900'>
          {current.text}
        </h2>
        {current.kind === 'vocabulary' && revealed ? (
          <div className='mt-5 space-y-2'>
            {current.pronunciations.length > 0 ? (
              <p className='text-lg text-slate-600'>
                {current.pronunciations.join(' · ')}
              </p>
            ) : null}
            {current.meanings.map(meaning => (
              <p key={meaning} className='text-sm text-slate-700'>
                {meaning}
              </p>
            ))}
            {current.pronunciations.length === 0 &&
            current.meanings.length === 0 ? (
              <p className='text-sm text-slate-500'>暂无读音和释义，请根据自己的回忆评分。</p>
            ) : null}
          </div>
        ) : null}
        {current.kind === 'sentence' && revealed ? (
          <p className='mt-5 text-sm text-slate-500'>
            根据是否能流畅理解或复述这句话进行评分。
          </p>
        ) : null}
      </div>

      {!revealed ? (
        <button
          type='button'
          onClick={() => setRevealed(true)}
          className='h-12 w-full rounded-xl bg-slate-900 text-sm font-bold text-white'>
          显示答案并评分
        </button>
      ) : (
        <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
          {RATINGS.map(item => (
            <button
              key={item.value}
              type='button'
              disabled={isPending}
              onClick={() => rate(item.value)}
              className={`h-11 rounded-xl border bg-white text-sm font-bold disabled:opacity-50 ${item.className}`}>
              {isPending ? '保存中…' : item.label}
            </button>
          ))}
        </div>
      )}
      {message ? (
        <p role='status' className='mt-3 text-sm text-red-600'>
          {message}
        </p>
      ) : null}
    </section>
  )
}
