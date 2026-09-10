'use client'

import Link from 'next/link'
import LearningRecordFields from './LearningRecordFields'
import { useDialog } from '@/context/DialogContext'
import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  LearningPointCategory,
  LearningRecordKind,
  SourceType,
} from '@prisma/client'

import { deleteLearningRecord, updateLearningRecord } from '@/modules/knowledge/learning-records/actions'
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

export default function LearningRecordItem({
  record,
  onChanged,
  compact = false,
}: {
  record: LearningRecordItemData
  compact?: boolean
  onChanged?: () => void
}) {
  const router = useRouter()
  const { confirm } = useDialog()
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
  }, [record.title, record.category, record.fragments, record.sentenceText, record.note])

  const resetEditor = useCallback(() => {
    setTitle(record.title)
    setCategory(record.category || LearningPointCategory.GRAMMAR)
    setFragments(record.fragments.join('\n'))
    setSentenceText(record.sentenceText)
    setNote(record.note || '')
    setStatusMessage('')
    setIsEditing(false)
  }, [record])

  useEffect(() => {
    if (!isEditing) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isPending) return
      event.preventDefault()
      event.stopImmediatePropagation()
      resetEditor()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isEditing, isPending, resetEditor])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isPending) return

    startTransition(async () => {
      try {
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
      window.dispatchEvent(new Event('learning-records-changed'))
      onChanged?.()
      router.refresh()
      } catch { setStatusMessage('保存失败，请重试。') }
    })
  }

  if (isEditing) {
    return (
      <article data-selection-editor='true' onKeyDown={event => { if (event.key === 'Escape' && !isPending) { event.stopPropagation(); resetEditor() } }} className='bg-white px-4 py-5 dark:bg-slate-950 md:px-5'>
        <form onSubmit={handleSubmit} className='space-y-5'>
          <LearningRecordFields kind={record.kind} value={{ title, category, fragments, sentenceText, note }} onChange={next => {
            setTitle(next.title)
            setCategory(next.category)
            setFragments(next.fragments)
            setSentenceText(next.sentenceText)
            setNote(next.note)
          }} />

          <div className='sticky bottom-0 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-950 border-t border-slate-200 pt-4 dark:border-slate-800'>
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
    <article data-selection-editor={isPending ? 'true' : undefined} className='px-1 py-6 md:px-2'>
      <div className={`flex flex-col gap-4 ${compact ? '' : 'sm:flex-row sm:items-start sm:justify-between'}`}>
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
          <button type='button' className='ui-btn ui-btn-danger ui-btn-sm' disabled={isPending} onClick={() => {
            startTransition(async () => {
              if (!await confirm('删除这条记录？此操作无法撤销。', { title: '删除记录', danger: true })) return
              try {
                const result = await deleteLearningRecord(record.id)
                if (!result.success) { setStatusMessage(result.message); return }
                window.dispatchEvent(new Event('learning-records-changed'))
                onChanged?.()
                router.refresh()
              } catch { setStatusMessage('删除失败，请重试。') }
            })
          }}>删除</button>
          {record.sourceHref ? (
            <Link href={record.sourceHref} className='ui-btn ui-btn-sm'>
              查看出处 ↗
            </Link>
          ) : null}
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

      {statusMessage ? <p role='alert' className='text-sm text-rose-700'>{statusMessage}</p> : null}
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

      <div className={`mt-4 grid gap-4 ${compact ? '' : 'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]'}`}>
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
