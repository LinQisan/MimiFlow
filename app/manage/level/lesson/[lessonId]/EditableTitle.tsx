// app/admin/manage/lesson/[lessonId]/EditableTitle.tsx
'use client'

import { useState } from 'react'
import { updateLessonTitle } from '../../action'

export default function EditableTitle({
  lessonId,
  initialTitle,
}: {
  lessonId: string
  initialTitle: string
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(initialTitle)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    if (!title.trim() || title === initialTitle) {
      setIsEditing(false)
      return
    }

    try {
      setIsSaving(true)
      await updateLessonTitle(lessonId, title)
      setIsEditing(false)
    } catch (error) {
      alert('保存失败，请重试')
      console.error(error)
    } finally {
      setIsSaving(false)
    }
  }

  if (isEditing) {
    return (
      <div className='mb-2 flex items-center gap-2'>
        <input
          type='text'
          value={title}
          onChange={e => setTitle(e.target.value)}
          className='rounded-md border border-gray-300 px-2 py-1 text-xl font-black text-gray-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 md:text-2xl'
          autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') {
              setTitle(initialTitle)
              setIsEditing(false)
            }
          }}
        />
        <button
          onClick={handleSave}
          disabled={isSaving}
          className='rounded-md bg-indigo-600 px-3 py-1 text-sm text-white hover:bg-indigo-700 disabled:opacity-50'>
          {isSaving ? '保存中...' : '保存'}
        </button>
        <button
          onClick={() => {
            setTitle(initialTitle)
            setIsEditing(false)
          }}
          disabled={isSaving}
          className='rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50'>
          取消
        </button>
      </div>
    )
  }

  return (
    <div className='group mb-2 flex items-center gap-3'>
      <h1 className='text-xl font-black text-gray-800 md:text-2xl'>{title}</h1>
      <button
        onClick={() => setIsEditing(true)}
        className='rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-500 opacity-0 transition-opacity hover:bg-gray-50 hover:text-indigo-600 group-hover:opacity-100'>
        修改标题
      </button>
    </div>
  )
}
