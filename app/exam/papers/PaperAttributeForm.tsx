'use client'

import { CollectionType } from '@prisma/client'
import { useActionState } from 'react'

import { updatePaperAttributes } from './actions'

type Props = {
  paperId: string
  defaultTitle: string
  defaultDescription: string
  defaultLanguage: string
  defaultLevel: string
  defaultParentId: string
  defaultSortOrder: number
  createdAt: string
  updatedAt: string
  defaultCollectionType: CollectionType
}

const initialState = { success: false, message: '' }

export default function PaperAttributeForm({
  paperId,
  defaultTitle,
  defaultDescription,
  defaultLanguage,
  defaultLevel,
  defaultParentId,
  defaultSortOrder,
  createdAt,
  updatedAt,
  defaultCollectionType,
}: Props) {
  const [state, formAction, pending] = useActionState(
    async (_prev: typeof initialState, formData: FormData) =>
      updatePaperAttributes(formData),
    initialState,
  )
  const normalizedCollectionType =
    defaultCollectionType === CollectionType.CUSTOM_GROUP
      ? CollectionType.CUSTOM_GROUP
      : defaultCollectionType === CollectionType.FAVORITES
        ? CollectionType.FAVORITES
        : CollectionType.PAPER

  return (
    <form action={formAction} className='space-y-2'>
      <input type='hidden' name='paperId' value={paperId} />
      <div className='grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px_auto]'>
        <input
          name='title'
          defaultValue={defaultTitle}
          placeholder='试卷名称'
          className='h-10 border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
        />
        <select
          name='collectionType'
          defaultValue={normalizedCollectionType}
          className='h-10 border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'>
          <option value='PAPER'>试卷（PAPER）</option>
          <option value='CUSTOM_GROUP'>分组（CUSTOM_GROUP）</option>
          <option value='FAVORITES'>收藏夹（FAVORITES）</option>
        </select>
        <button
          type='submit'
          disabled={pending}
          className='h-10 min-w-20 border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60'>
          {pending ? '保存中...' : '保存'}
        </button>
      </div>
      <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
        <input
          name='language'
          defaultValue={defaultLanguage}
          placeholder='语言（例：ja / en / zh）'
          className='h-10 border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
        />
        <input
          name='level'
          defaultValue={defaultLevel}
          placeholder='等级（例：N1 / B2）'
          className='h-10 border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
        />
        <input
          name='sortOrder'
          type='number'
          defaultValue={defaultSortOrder}
          placeholder='排序'
          className='h-10 border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
        />
      </div>
      <input
        name='parentId'
        defaultValue={defaultParentId}
        placeholder='父级集合 ID（可选）'
        className='h-10 w-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
      />
      <textarea
        name='description'
        defaultValue={defaultDescription}
        placeholder='试卷描述（可选）'
        className='min-h-20 w-full resize-y border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
      />
      <p className='text-[11px] font-medium text-slate-400'>
        ID: {paperId} · 创建: {createdAt} · 更新: {updatedAt}
      </p>
      {state.message ? (
        <p
          className={`text-xs font-semibold ${
            state.success ? 'text-blue-700' : 'text-rose-600'
          }`}>
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
