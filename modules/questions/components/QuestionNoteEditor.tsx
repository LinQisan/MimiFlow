'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { updateQuestionNote } from '@/modules/practice/actions/questions'

type Props = {
  questionId: string
  initialNote?: string | null
  onSaved?: (questionId: string, note: string) => void
}

export default function QuestionNoteEditor({
  questionId,
  initialNote = '',
  onSaved,
}: Props) {
  const previousQuestionIdRef = useRef(questionId)
  const savedNoteRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const editorHeightRef = useRef(128)
  const [note, setNote] = useState((initialNote || '').trim())
  const [savedNote, setSavedNote] = useState((initialNote || '').trim())
  const [isEditing, setIsEditing] = useState(!(initialNote || '').trim())
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  useEffect(() => {
    if (previousQuestionIdRef.current === questionId) return
    previousQuestionIdRef.current = questionId
    const nextNote = (initialNote || '').trim()
    setNote(nextNote)
    setSavedNote(nextNote)
    setIsEditing(nextNote.length === 0)
    setStatus('idle')
    editorHeightRef.current = 128
  }, [questionId, initialNote])

  useLayoutEffect(() => {
    if (!isEditing || !textareaRef.current) return

    const textarea = textareaRef.current
    textarea.style.height = 'auto'
    const nextHeight = Math.max(
      editorHeightRef.current,
      textarea.scrollHeight,
      128,
    )
    editorHeightRef.current = nextHeight
    textarea.style.height = `${nextHeight}px`
  }, [isEditing, note, questionId])

  const enterEditing = () => {
    if (savedNoteRef.current) {
      editorHeightRef.current = Math.max(
        editorHeightRef.current,
        savedNoteRef.current.offsetHeight,
      )
    }
    setNote(savedNote)
    setIsEditing(true)
    setStatus('idle')
  }

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    setStatus('idle')
    const result = await updateQuestionNote(questionId, note)
    if (result.success) {
      const normalized = note.trim()
      setSavedNote(normalized)
      setNote(normalized)
      setIsEditing(false)
      setStatus('saved')
      onSaved?.(questionId, normalized)
    } else {
      setStatus('error')
    }
    setSaving(false)
  }

  return (
    <section className='mx-auto mt-4 w-full max-w-5xl border-y border-slate-200 py-4'>
      <div className='mb-3 flex min-h-8 items-center justify-between gap-3'>
        <div className='flex min-w-0 items-center gap-2'>
          <h4 className='shrink-0 text-sm font-semibold tracking-tight text-slate-900'>
            题目笔记
          </h4>
          <span
            aria-live='polite'
            className={`truncate text-xs ${
              status === 'error'
                ? 'text-rose-600'
                : status === 'saved'
                  ? 'text-emerald-700'
                  : 'text-slate-400'
            }`}>
            {saving
              ? '正在保存…'
              : status === 'saved'
                ? '已保存'
                : status === 'error'
                  ? '保存失败，请重试'
                  : isEditing
                    ? '编辑中'
                    : '已保存的笔记'}
          </span>
        </div>
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
                  className='ui-btn ui-btn-sm'>
                  取消
                </button>
              ) : null}
              <button
                type='button'
                onClick={handleSave}
                disabled={saving}
                className='ui-btn ui-btn-sm ui-btn-primary disabled:opacity-50'>
                {saving ? '保存中...' : '保存笔记'}
              </button>
            </>
          ) : (
            <button
              type='button'
              onClick={enterEditing}
              className='ui-btn ui-btn-sm'>
              编辑
            </button>
          )}
        </div>
      </div>
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={note}
          onChange={event => setNote(event.target.value)}
          placeholder='记录本题思路、错因、语法要点...'
          rows={4}
          className='block min-h-32 w-full resize-y rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm leading-7 text-slate-800 outline-none shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] focus:border-slate-500 focus:ring-2 focus:ring-slate-200'
        />
      ) : (
        <div
          ref={savedNoteRef}
          onDoubleClick={enterEditing}
          title='双击编辑笔记'
          className='min-h-32 cursor-text whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-3 text-sm leading-7 text-slate-700'>
          {savedNote || '暂无笔记'}
        </div>
      )}
    </section>
  )
}
