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
        className='mb-4 w-full border border-dashed border-indigo-300 px-4 py-2.5 text-sm font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 md:mb-6'>
        新增分类
      </button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className='mb-6 border border-indigo-100 bg-indigo-50/50 p-4 md:p-5'>
      <div className='grid grid-cols-1 gap-3 md:grid-cols-[140px_180px_1fr_auto] md:items-end'>
        <div>
          <label className='mb-1 block text-xs text-gray-500'>
            分类 ID
          </label>
          <input
            required
            name='id'
            placeholder='例: n3'
            className='w-full border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400'
          />
        </div>
        <div>
          <label className='mb-1 block text-xs text-gray-500'>分类名称</label>
          <input
            required
            name='title'
            placeholder='例: N3 听力'
            className='w-full border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400'
          />
        </div>
        <div>
          <label className='mb-1 block text-xs text-gray-500'>说明（可选）</label>
          <input
            name='description'
            placeholder='例: 包含 N3 历年语料'
            className='w-full border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400'
          />
        </div>
        <div className='flex gap-2'>
          <button
            type='submit'
            disabled={loading}
            className='bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60'>
            {loading ? '保存中...' : '保存'}
          </button>
          <button
            type='button'
            onClick={() => setIsOpen(false)}
            className='border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50'>
            取消
          </button>
        </div>
      </div>
    </form>
  )
}
