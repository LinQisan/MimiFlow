'use client'

// Practice attribute form.

import { CollectionType } from '@prisma/client'
import { useActionState } from 'react'

import { updatePaperAttributes } from '@/features/practice/actions'
import CustomSelect from '@/components/ui/CustomSelect'

type Props = {
  paperId: string
  defaultTitle: string
  defaultDescription: string
  defaultLanguage: string
  defaultLevel: string
  defaultParentId: string
  defaultSortOrder: number
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
      : CollectionType.PAPER

  return (
    <form action={formAction} className='space-y-2'>
      <input type='hidden' name='paperId' value={paperId} />
      <input type='hidden' name='parentId' value={defaultParentId} />
      <input type='hidden' name='description' value={defaultDescription} />
      <div className='grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-[2fr_1.4fr_1fr_1fr_5rem_auto]'>
        <input
          name='title'
          defaultValue={defaultTitle}
          placeholder='试卷名称'
          aria-label='试卷名称'
          className='h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200'
        />
        <CustomSelect
          name='collectionType'
          defaultValue={normalizedCollectionType}
          aria-label='集合类型'
          className='h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200'>
          <option value='PAPER'>正式试卷</option>
          <option value='CUSTOM_GROUP'>普通集合</option>
        </CustomSelect>
        <input
          name='language'
          defaultValue={defaultLanguage}
          placeholder='语言'
          aria-label='语言'
          className='h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200'
        />
        <input
          name='level'
          defaultValue={defaultLevel}
          placeholder='等级'
          aria-label='等级'
          className='h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200'
        />
        <input
          name='sortOrder'
          type='number'
          defaultValue={defaultSortOrder}
          placeholder='排序'
          aria-label='排序'
          className='h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200'
        />
        <button
          type='submit'
          disabled={pending}
          className='ui-btn ui-btn-sm ui-btn-primary h-9 disabled:cursor-not-allowed disabled:opacity-60'>
          {pending ? '保存中' : '保存'}
        </button>
      </div>
      {state.message ? (
        <p
          className={`text-xs font-semibold ${
            state.success ? 'text-slate-700' : 'text-rose-600'
          }`}>
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
