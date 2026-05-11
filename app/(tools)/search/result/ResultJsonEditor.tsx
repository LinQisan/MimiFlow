'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateGlobalSearchResultDetail } from '@/app/actions/globalSearch'

type ResultJsonEditorProps = {
  resultId: string
  type: 'vocabulary' | 'sentence' | 'passage' | 'quiz' | 'question' | 'dialogue'
  rawJson: string
}

export default function ResultJsonEditor({
  resultId,
  type,
  rawJson,
}: ResultJsonEditorProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(rawJson)
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const editable = type !== 'dialogue'

  const statusClass = useMemo(() => {
    if (!message) return 'text-slate-500'
    if (message.includes('已保存')) return 'text-emerald-700'
    return 'text-rose-600'
  }, [message])

  const onReset = () => {
    setDraft(rawJson)
    setMessage('已重置为当前数据。')
  }

  const onSave = () => {
    startTransition(async () => {
      const result = await updateGlobalSearchResultDetail({
        resultId,
        type,
        rawJson: draft,
      })
      setMessage(result.message)
      if (result.success) {
        setIsEditing(false)
        router.refresh()
      }
    })
  }

  return (
    <section className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <h2 className='text-base font-bold text-slate-900'>结果数据编辑</h2>
          <p className='mt-1 text-xs text-slate-500'>
            {editable
              ? '支持直接修改 JSON 并保存到数据库。'
              : '当前类型为听力聚合结果，仅支持查看。'}
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          {editable && (
            <button
              type='button'
              onClick={() => setIsEditing(v => !v)}
              className='rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50'>
              {isEditing ? '退出编辑' : '编辑 JSON'}
            </button>
          )}
          {isEditing && editable && (
            <>
              <button
                type='button'
                onClick={onReset}
                className='rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50'
                disabled={isPending}>
                重置
              </button>
              <button
                type='button'
                onClick={onSave}
                className='rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300'
                disabled={isPending}>
                {isPending ? '保存中...' : '保存修改'}
              </button>
            </>
          )}
        </div>
      </div>

      {message ? (
        <p className={`mt-2 text-xs font-medium ${statusClass}`}>{message}</p>
      ) : null}

      <div className='mt-3 rounded-xl border border-slate-200 bg-slate-950'>
        {isEditing && editable ? (
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            spellCheck={false}
            className='h-[420px] w-full resize-y rounded-xl bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100 outline-none'
          />
        ) : (
          <pre className='max-h-[420px] overflow-auto p-3 text-xs leading-relaxed text-slate-100'>
            {rawJson}
          </pre>
        )}
      </div>
    </section>
  )
}
