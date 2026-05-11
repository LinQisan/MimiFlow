'use client'

import { useActionState, useState } from 'react'
import type { CollectionType, MaterialType } from '@prisma/client'
import { importEpubAction } from '../actions'
import CollectionBrowserSelect from '@/components/manage/upload/CollectionBrowserSelect'
import { toCollectionBrowserOptions } from '@/components/manage/upload/collectionBrowserOptions'

type UploadCollectionLite = {
  id: string
  name: string
  parentId?: string | null
  sortOrder?: number
  collectionType?: CollectionType
  materialType?: MaterialType
  language?: string
  examLevel?: string
  level: { title: string }
  lessons: {
    title: string
    audioFile: string
    chapterName: string
    materialType: MaterialType
  }[]
}

export default function EpubImportForm({
  collections,
}: {
  collections: UploadCollectionLite[]
}) {
  const [state, formAction, pending] = useActionState(importEpubAction, {
    success: false,
    message: '',
  })
  const [collectionId, setCollectionId] = useState('')
  const options = toCollectionBrowserOptions(
    collections
      .filter(
        item =>
          !item.materialType ||
          item.materialType === 'READING' ||
          item.collectionType === 'LIBRARY_ROOT' ||
          item.collectionType === 'BOOK' ||
          item.collectionType === 'CHAPTER',
      ),
  )

  return (
    <form action={formAction} className='space-y-4'>
      <div className='grid gap-4 md:grid-cols-[1fr_1fr]'>
        <label className='space-y-2'>
          <span className='text-sm font-bold text-slate-800'>EPUB 文件</span>
          <input
            name='epubFile'
            type='file'
            accept='.epub,application/epub+zip'
            required
            className='block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-bold file:text-white'
          />
        </label>

        <label className='space-y-2'>
          <span className='text-sm font-bold text-slate-800'>标题覆盖</span>
          <input
            name='title'
            placeholder='留空则使用电子书标题'
            className='h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
          />
        </label>
      </div>

      <div className='space-y-2'>
        <span className='text-sm font-bold text-slate-800'>归入阅读集合</span>
        <CollectionBrowserSelect
          value={collectionId}
          onChange={setCollectionId}
          options={options}
          placeholder='可选：选择阅读集合'
          recentKey='epub-import-collections'
        />
        <input type='hidden' name='collectionId' value={collectionId} />
      </div>

      {state.message ? (
        <p
          className={`rounded-2xl border px-4 py-3 text-sm ${
            state.success
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}>
          {state.message}
        </p>
      ) : null}

      <div className='flex justify-end'>
        <button
          type='submit'
          disabled={pending}
          className='inline-flex h-12 items-center justify-center rounded-2xl bg-slate-900 px-5 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-300'>
          {pending ? '导入中...' : '导入电子书'}
        </button>
      </div>
    </form>
  )
}
