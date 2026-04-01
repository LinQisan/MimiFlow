// app/admin/manage/lesson/[lessonId]/DialogueRow.tsx
'use client'

import { useState } from 'react'
import { updateDialogue, deleteDialogue } from '../../action'
import { useDialog } from '@/context/DialogContext'

type DialogueProps = {
  id: number
  text: string
  start: number
  end: number
}

export default function DialogueRow({ dialogue }: { dialogue: DialogueProps }) {
  const dialogModal = useDialog()
  const [isEditing, setIsEditing] = useState(false)
  const [text, setText] = useState(dialogue.text)
  const [start, setStart] = useState(dialogue.start)
  const [end, setEnd] = useState(dialogue.end)
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    setLoading(true)
    const res = await updateDialogue(dialogue.id, {
      text,
      start: Number(start),
      end: Number(end),
    })
    setLoading(false)
    if (res.success) {
      setIsEditing(false)
    } else {
      await dialogModal.alert(res.message)
    }
  }

  const handleDelete = async () => {
    const shouldDelete = await dialogModal.confirm('确定要删除这句字幕吗？删除后不可恢复。', {
      title: '删除字幕',
      danger: true,
      confirmText: '删除',
    })
    if (!shouldDelete) return
    setLoading(true)
    await deleteDialogue(dialogue.id)
  }

  if (isEditing) {
    return (
      <div className='flex gap-2 items-center bg-blue-50 p-2 rounded-lg border border-blue-200'>
        <input
          type='number'
          step='0.01'
          value={start}
          onChange={e => setStart(Number(e.target.value))}
          className='w-20 p-1 text-sm rounded border'
          title='开始时间'
        />
        <span className='text-gray-400'>-</span>
        <input
          type='number'
          step='0.01'
          value={end}
          onChange={e => setEnd(Number(e.target.value))}
          className='w-20 p-1 text-sm rounded border'
          title='结束时间'
        />
        <input
          type='text'
          value={text}
          onChange={e => setText(e.target.value)}
          className='flex-1 p-1 text-sm rounded border'
        />
        <button
          onClick={handleSave}
          disabled={loading}
          className='px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600'>
          保存
        </button>
        <button
          onClick={() => setIsEditing(false)}
          className='px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300'>
          取消
        </button>
      </div>
    )
  }

  return (
    <div className='flex gap-4 items-center hover:bg-gray-50 p-2 rounded-lg border border-transparent hover:border-gray-200 group transition-colors'>
      <div className='w-32 text-xs text-gray-400 font-mono text-right shrink-0'>
        [{dialogue.start.toFixed(2)} - {dialogue.end.toFixed(2)}]
      </div>
      <div className='flex-1 text-sm text-gray-800'>{dialogue.text}</div>
      <div className='opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 shrink-0'>
        <button
          onClick={() => setIsEditing(true)}
          className='text-xs text-blue-500 hover:text-blue-700'>
          编辑
        </button>
        <button
          onClick={handleDelete}
          disabled={loading}
          className='text-xs text-red-500 hover:text-red-700'>
          删除
        </button>
      </div>
    </div>
  )
}
