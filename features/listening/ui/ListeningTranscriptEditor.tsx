'use client'

import { useState, useTransition } from 'react'

import { updateListeningDialogueText } from '@/features/listening/manage-actions'

type Dialogue = {
  id: number
  text: string
  start: number
  end: number
}

type Props = {
  materialId: string
  initialDialogues: Dialogue[]
}

export default function ListeningTranscriptEditor({
  materialId,
  initialDialogues,
}: Props) {
  const [dialogues, setDialogues] = useState(initialDialogues)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const beginEditing = (index: number) => {
    setEditingIndex(index)
    setDraft(dialogues[index]?.text || '')
    setMessage('')
  }

  const cancelEditing = () => {
    setEditingIndex(null)
    setDraft('')
    setMessage('')
  }

  const saveText = (index: number) => {
    const text = draft.trim()
    if (!text) {
      setMessage('文本不能为空。')
      return
    }

    const formData = new FormData()
    formData.set('id', materialId)
    formData.set('dialogueIndex', String(index))
    formData.set('text', text)

    startTransition(async () => {
      const result = await updateListeningDialogueText(formData)
      if (!result.success) {
        setMessage(result.message || '保存失败。')
        return
      }
      setDialogues(previous =>
        previous.map((dialogue, dialogueIndex) =>
          dialogueIndex === index ? { ...dialogue, text: result.text } : dialogue,
        ),
      )
      setEditingIndex(null)
      setDraft('')
      setMessage('文本已更新。')
    })
  }

  return (
    <details
      open
      className='group overflow-hidden rounded-[18px] border border-slate-200/80 bg-white shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)]'>
      <summary className='flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-semibold text-slate-800 marker:content-none md:px-6'>
        <span>逐句文本</span>
        <span className='text-xs font-medium text-slate-400 group-open:hidden'>展开编辑</span>
        <span className='hidden text-xs font-medium text-slate-400 group-open:inline'>可逐句修改</span>
      </summary>
      <div className='border-t border-slate-100'>
        <div className='hidden border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-semibold text-slate-500 md:grid md:grid-cols-[9rem_minmax(0,1fr)_4rem] md:px-6'>
          <span className='text-right'>时间轴（秒）</span>
          <span className='pl-4'>文本内容</span>
          <span className='text-right'>操作</span>
        </div>
        <div className='divide-y divide-slate-100 px-4 md:px-6'>
          {dialogues.length === 0 ? (
            <div className='py-10 text-center text-sm text-slate-400'>
              暂无文本数据
            </div>
          ) : (
            dialogues.map((dialogue, index) => {
              const isEditing = editingIndex === index
              return (
                <div
                  key={`${dialogue.id}-${dialogue.start}-${index}`}
                  className='grid gap-2 py-3.5 md:grid-cols-[9rem_minmax(0,1fr)_4rem] md:gap-4'>
                  <div className='font-mono text-xs font-semibold tabular-nums text-slate-500 md:text-right'>
                    {dialogue.start.toFixed(2)} → {dialogue.end.toFixed(2)}
                  </div>

                  {isEditing ? (
                    <div className='min-w-0'>
                      <textarea
                        autoFocus
                        value={draft}
                        onChange={event => setDraft(event.currentTarget.value)}
                        rows={3}
                        aria-label={`编辑第 ${index + 1} 句文本`}
                        className='w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100'
                      />
                      {message ? (
                        <p className='mt-1 text-xs font-semibold text-rose-600'>{message}</p>
                      ) : null}
                      <div className='mt-2 flex gap-2'>
                        <button
                          type='button'
                          disabled={isPending}
                          onClick={() => saveText(index)}
                          className='ui-btn ui-btn-sm ui-btn-primary disabled:opacity-50'>
                          {isPending ? '保存中…' : '保存'}
                        </button>
                        <button
                          type='button'
                          disabled={isPending}
                          onClick={cancelEditing}
                          className='ui-btn ui-btn-sm disabled:opacity-50'>
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className='min-w-0 whitespace-pre-wrap text-sm leading-6 text-slate-800'>
                      {dialogue.text}
                    </p>
                  )}

                  <div className='md:text-right'>
                    {!isEditing ? (
                      <button
                        type='button'
                        disabled={editingIndex !== null || isPending}
                        onClick={() => beginEditing(index)}
                        className='text-xs font-semibold text-slate-500 transition hover:text-slate-950 disabled:opacity-40'>
                        编辑
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })
          )}
        </div>
        {message && editingIndex === null ? (
          <p className='border-t border-slate-100 px-5 py-3 text-xs font-semibold text-emerald-700 md:px-6'>
            {message}
          </p>
        ) : null}
      </div>
    </details>
  )
}
