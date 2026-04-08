'use client'

import { useEffect, useState } from 'react'

import { updateQuestionNote } from '@/app/actions/content'

type Props = {
  questionId: string
  initialNote?: string | null
  onSaved?: (nextNote: string) => void
}

export default function QuestionNoteEditor({
  questionId,
  initialNote = '',
  onSaved,
}: Props) {
  const [note, setNote] = useState(initialNote || '')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  useEffect(() => {
    setNote(initialNote || '')
    setStatus('idle')
  }, [questionId, initialNote])

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    setStatus('idle')
    const result = await updateQuestionNote(questionId, note)
    if (result.success) {
      setStatus('saved')
      onSaved?.(note.trim())
    } else {
      setStatus('error')
    }
    setSaving(false)
  }

  return (
    <section className='mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
      <div className='mb-2 flex items-center justify-between'>
        <h4 className='text-sm font-semibold text-slate-800'>题目笔记</h4>
        <button
          type='button'
          onClick={handleSave}
          disabled={saving}
          className='rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50'>
          {saving ? '保存中...' : '保存笔记'}
        </button>
      </div>
      <textarea
        value={note}
        onChange={event => setNote(event.target.value)}
        placeholder='记录本题思路、错因、语法要点...'
        rows={3}
        className='w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400'
      />
      {status === 'saved' ? (
        <p className='mt-2 text-xs text-emerald-600'>已保存</p>
      ) : null}
      {status === 'error' ? (
        <p className='mt-2 text-xs text-rose-600'>保存失败，请重试</p>
      ) : null}
    </section>
  )
}

