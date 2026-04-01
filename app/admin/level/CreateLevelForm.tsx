// app/admin/manage/CreateLevelForm.tsx
'use client'

import { useState } from 'react'
import { createLevel } from './action'
import { useDialog } from '@/context/DialogContext'

export default function CreateLevelForm() {
  const dialog = useDialog()
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const res = await createLevel(formData)
    setLoading(false)
    if (res.success) {
      setIsOpen(false)
    } else {
      await dialog.alert(res.message || '保存失败')
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className='mb-6 px-4 py-2 border border-dashed border-indigo-400 text-indigo-600 rounded-xl hover:bg-indigo-50 transition-colors text-sm w-full font-medium'>
        + 新增大分类模块 (如 N3、商务日语)
      </button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className='mb-6 bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex flex-wrap gap-3 items-end'>
      <div>
        <label className='block text-xs text-gray-500 mb-1'>
          模块 ID (英文数字)
        </label>
        <input
          required
          name='id'
          placeholder='例: n3'
          className='px-3 py-1.5 text-sm rounded border w-32'
        />
      </div>
      <div>
        <label className='block text-xs text-gray-500 mb-1'>展示标题</label>
        <input
          required
          name='title'
          placeholder='例: N3 听力'
          className='px-3 py-1.5 text-sm rounded border w-40'
        />
      </div>
      <div className='flex-1'>
        <label className='block text-xs text-gray-500 mb-1'>描述 (选填)</label>
        <input
          name='description'
          placeholder='例: 包含N3历年真题...'
          className='px-3 py-1.5 text-sm rounded border w-full'
        />
      </div>
      <div className='flex gap-2'>
        <button
          type='submit'
          disabled={loading}
          className='px-4 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700'>
          {loading ? '保存中...' : '保存'}
        </button>
        <button
          type='button'
          onClick={() => setIsOpen(false)}
          className='px-4 py-1.5 bg-white text-gray-600 border text-sm rounded hover:bg-gray-50'>
          取消
        </button>
      </div>
    </form>
  )
}
