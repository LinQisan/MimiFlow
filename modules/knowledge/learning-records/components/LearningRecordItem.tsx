'use client'

import Link from 'next/link'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  LearningPointCategory,
  LearningRecordKind,
  SourceType,
} from '@prisma/client'

import { updateLearningRecord } from '@/modules/knowledge/learning-records/actions'
import {
  LEARNING_POINT_CATEGORY_LABELS,
  LEARNING_RECORD_KIND_LABELS,
  SOURCE_TYPE_LABELS,
} from '@/modules/knowledge/learning-records/domain'

type LearningRecordItemData = {
  id: string
  kind: LearningRecordKind
  category: LearningPointCategory | null
  title: string
  fragments: string[]
  sentenceText: string
  note: string | null
  sourceType: SourceType
  sourceHref: string | null
  updatedAtLabel: string
}

const INPUT_CLASS =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-700 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-400 dark:focus:ring-slate-800'
const LABEL_CLASS = 'text-xs font-bold text-slate-700 dark:text-slate-300'

export default function LearningRecordItem({
  record,
}: {
  record: LearningRecordItemData
}) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState(record.title)
  const [category, setCategory] = useState<LearningPointCategory>(
    record.category || LearningPointCategory.GRAMMAR,
  )
  const [fragments, setFragments] = useState(record.fragments.join('\n'))
  const [sentenceText, setSentenceText] = useState(record.sentenceText)
  const [note, setNote] = useState(record.note || '')
  const [statusMessage, setStatusMessage] = useState('')

  useEffect(() => {
    setTitle(record.title)
    setCategory(record.category || LearningPointCategory.GRAMMAR)
    setFragments(record.fragments.join('\n'))
    setSentenceText(record.sentenceText)
    setNote(record.note || '')
  }, [record])

  const resetEditor = () => {
    setTitle(record.title)
    setCategory(record.category || LearningPointCategory.GRAMMAR)
    setFragments(record.fragments.join('\n'))
    setSentenceText(record.sentenceText)
    setNote(record.note || '')
    setStatusMessage('')
    setIsEditing(false)
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isPending) return

    startTransition(async () => {
      const result = await updateLearningRecord({
        id: record.id,
        kind: record.kind,
        category:
          record.kind === LearningRecordKind.LEARNING_POINT ? category : null,
        title,
        fragments: fragments.split(/\n+/),
        sentenceText,
        note,
      })

      if (!result.success) {
        setStatusMessage(result.message)
        return
      }

      setIsEditing(false)
      router.refresh()
    })
  }

  if (isEditing) {
    return (
      <article className='bg-white px-4 py-5 dark:bg-slate-950 md:px-5'>
        <form onSubmit={handleSubmit} className='space-y-5'>
          <div className='flex flex-col gap-4 md:flex-row md:items-start'>
            <label className='block min-w-0 flex-1 space-y-1.5'>
              <span className={LABEL_CLASS}>
                {record.kind === LearningRecordKind.SENTENCE
                  ? '句子标题'
                  : '学习点名称'}
              </span>
              <input
                value={title}
                onChange={event => setTitle(event.target.value)}
                className={INPUT_CLASS}
                autoFocus
              />
            </label>

            {record.kind === LearningRecordKind.LEARNING_POINT ? (
              <fieldset className='space-y-1.5 md:w-72'>
                <legend className={LABEL_CLASS}>类型</legend>
                <div className='flex flex-wrap gap-1.5'>
                  {Object.values(LearningPointCategory).map(option => (
                    <button
                      key={option}
                      type='button'
                      aria-pressed={category === option}
                      onClick={() => setCategory(option)}
                      className={`min-h-9 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition ${
                        category === option
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                      }`}>
                      {LEARNING_POINT_CATEGORY_LABELS[option]}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}
          </div>

          {record.kind === LearningRecordKind.LEARNING_POINT ? (
            <label className='block space-y-1.5'>
              <span className={LABEL_CLASS}>句内片段</span>
              <textarea
                value={fragments}
                onChange={event => setFragments(event.target.value)}
                rows={2}
                className={`${INPUT_CLASS} resize-y`}
                placeholder='每行一个片段'
              />
            </label>
          ) : null}

          <div className='grid gap-4 lg:grid-cols-2'>
            <label className='block space-y-1.5'>
              <span className={LABEL_CLASS}>原句</span>
              <textarea
                value={sentenceText}
                onChange={event => setSentenceText(event.target.value)}
                rows={5}
                className={`${INPUT_CLASS} resize-y`}
              />
            </label>

            <label className='block space-y-1.5'>
              <span className={LABEL_CLASS}>笔记 / 释义</span>
              <textarea
                value={note}
                onChange={event => setNote(event.target.value)}
                rows={5}
                className={`${INPUT_CLASS} resize-y`}
                placeholder='含义、语感、近义表达或易错点'
              />
            </label>
          </div>

          <div className='flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800'>
            <p className='text-xs text-slate-500'>
              正在原位置编辑，保存后会立即更新此条记录。
            </p>
            <div className='flex items-center gap-2'>
              <button
                type='button'
                disabled={isPending}
                onClick={resetEditor}
                className='ui-btn ui-btn-sm'>
                取消
              </button>
              <button
                type='submit'
                disabled={isPending}
                className='ui-btn ui-btn-primary ui-btn-sm disabled:cursor-wait disabled:opacity-60'>
                {isPending ? '保存中…' : '保存修改'}
              </button>
            </div>
          </div>

          {statusMessage ? (
            <p role='alert' className='text-xs font-semibold text-rose-700'>
              {statusMessage}
            </p>
          ) : null}
        </form>
      </article>
    )
  }

  return (
    <article className='px-1 py-6 md:px-2'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500'>
            <span className='ui-tag ui-tag-muted'>
              {LEARNING_RECORD_KIND_LABELS[record.kind]}
            </span>
            {record.category ? (
              <span>{LEARNING_POINT_CATEGORY_LABELS[record.category]}</span>
            ) : null}
            <span aria-hidden='true'>·</span>
            <span>{SOURCE_TYPE_LABELS[record.sourceType]}</span>
            <span aria-hidden='true'>·</span>
            <time>{record.updatedAtLabel}</time>
          </div>
          <h2 className='mt-2 text-xl font-bold tracking-tight text-slate-950 dark:text-slate-100'>
            {record.title}
          </h2>
        </div>

        <div className='flex shrink-0 items-center gap-2'>
          {record.sourceHref ? (
            <Link href={record.sourceHref} className='ui-btn ui-btn-sm'>
              查看出处 ↗
            </Link>
          ) : (
            <span className='text-xs text-slate-400'>出处不可用</span>
          )}
          <button
            type='button'
            onClick={() => {
              setStatusMessage('')
              setIsEditing(true)
            }}
            className='ui-btn ui-btn-sm'>
            编辑内容
          </button>
        </div>
      </div>

      {record.fragments.length > 0 ? (
        <div className='mt-4 flex flex-wrap gap-1.5'>
          {record.fragments.map(fragment => (
            <span
              key={fragment}
              className='rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-950 dark:bg-amber-950/40 dark:text-amber-200'>
              {fragment}
            </span>
          ))}
        </div>
      ) : null}

      <div className='mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]'>
        <blockquote className='border-l-2 border-slate-300 pl-4 text-sm leading-7 text-slate-700 dark:border-slate-700 dark:text-slate-300'>
          {record.sentenceText}
        </blockquote>
        {record.note ? (
          <p className='whitespace-pre-wrap text-sm leading-7 text-slate-600 dark:text-slate-300'>
            {record.note}
          </p>
        ) : (
          <p className='text-sm text-slate-400'>暂无笔记</p>
        )}
      </div>
    </article>
  )
}
