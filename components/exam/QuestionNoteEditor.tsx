'use client'

import { useEffect, useRef, useState } from 'react'

import { updateQuestionNote } from '@/app/actions/content'

type Props = {
  questionId: string
  initialNote?: string | null
}

export default function QuestionNoteEditor({
  questionId,
  initialNote = '',
}: Props) {
  const noteCacheRef = useRef<Record<string, string>>({})
  const [note, setNote] = useState((initialNote || '').trim())
  const [savedNote, setSavedNote] = useState((initialNote || '').trim())
  const [isEditing, setIsEditing] = useState(!(initialNote || '').trim())
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  useEffect(() => {
    const cached = noteCacheRef.current[questionId]
    const nextNote = (cached ?? initialNote ?? '').trim()
    setNote(nextNote)
    setSavedNote(nextNote)
    setIsEditing(nextNote.length === 0)
    setStatus('idle')
  }, [questionId, initialNote])

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    setStatus('idle')
    const result = await updateQuestionNote(questionId, note)
    if (result.success) {
      const normalized = note.trim()
      noteCacheRef.current[questionId] = normalized
      setSavedNote(normalized)
      setNote(normalized)
      setIsEditing(false)
      setStatus('saved')
    } else {
      setStatus('error')
    }
    setSaving(false)
  }

  return (
    <section className='mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
      <div className='mb-2 flex items-center justify-between'>
        <h4 className='text-sm font-semibold text-slate-800'>题目笔记</h4>
        <div className='flex items-center gap-2'>
          {isEditing ? (
            <>
              {savedNote ? (
                <button
                  type='button'
                  onClick={() => {
                    setNote(savedNote)
                    setIsEditing(false)
                    setStatus('idle')
                  }}
                  className='rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50'>
                  取消
                </button>
              ) : null}
              <button
                type='button'
                onClick={handleSave}
                disabled={saving}
                className='rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50'>
                {saving ? '保存中...' : '保存笔记'}
              </button>
            </>
          ) : (
            <button
              type='button'
              onClick={() => {
                setNote(savedNote)
                setIsEditing(true)
                setStatus('idle')
              }}
              className='rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50'>
              编辑
            </button>
          )}
        </div>
      </div>
      {isEditing ? (
        <textarea
          value={note}
          onChange={event => setNote(event.target.value)}
          placeholder='记录本题思路、错因、语法要点...'
          rows={4}
          className='w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400'
        />
      ) : (
        <div className='min-h-16 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-7 text-slate-700'>
          {savedNote || '暂无笔记'}
        </div>
      )}
      {status === 'saved' ? (
        <p className='mt-2 text-xs text-emerald-600'>已保存</p>
      ) : null}
      {status === 'error' ? (
        <p className='mt-2 text-xs text-rose-600'>保存失败，请重试</p>
      ) : null}
    </section>
  )
}
