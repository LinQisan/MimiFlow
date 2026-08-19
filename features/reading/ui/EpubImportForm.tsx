'use client'

import { useActionState, useMemo, useState } from 'react'
import type { CollectionType, MaterialType } from '@prisma/client'

import {
  importEpubAction,
  importPastedBookAction,
} from '@/features/reading/ebook-actions'
import CollectionBrowserSelect from '@/components/manage/import/CollectionBrowserSelect'
import { toCollectionBrowserOptions } from '@/components/manage/import/collectionBrowserOptions'
import { parsePastedBookText } from '@/lib/ebooks/pasted-book'

type UploadCollectionLite = {
  id: string
  name: string
  parentId?: string | null
  sortOrder?: number
  collectionType?: CollectionType
  materialType?: MaterialType
  acceptedMaterialTypes?: MaterialType[]
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

const initialActionState = { success: false, message: '' }

export default function EpubImportForm({
  collections,
  defaultLanguage = 'ja',
}: {
  collections: UploadCollectionLite[]
  defaultLanguage?: string
}) {
  const [sourceMode, setSourceMode] = useState<'paste' | 'epub'>('paste')
  const [bookTitle, setBookTitle] = useState('')
  const [bookContent, setBookContent] = useState('')
  const [collectionId, setCollectionId] = useState('')
  const [epubState, epubAction, epubPending] = useActionState(
    importEpubAction,
    initialActionState,
  )
  const [pasteState, pasteAction, pastePending] = useActionState(
    importPastedBookAction,
    initialActionState,
  )
  const options = useMemo(
    () => toCollectionBrowserOptions(collections),
    [collections],
  )
  const preview = useMemo(
    () => parsePastedBookText(bookContent, bookTitle),
    [bookContent, bookTitle],
  )
  const activeState = sourceMode === 'paste' ? pasteState : epubState
  const pending = sourceMode === 'paste' ? pastePending : epubPending

  return (
    <div className='mx-auto max-w-4xl space-y-6'>
      <header className='border-b border-slate-200 pb-5'>
        <h2 className='sr-only'>导入电子书</h2>
        <p className='text-sm leading-6 text-slate-500'>
          粘贴专业书籍正文，或导入已有 EPUB。章节、表格与数学公式会保留在阅读器中。
        </p>
      </header>

      <div
        role='tablist'
        aria-label='电子书来源'
        className='flex border-b border-slate-200'>
        <button
          type='button'
          role='tab'
          aria-selected={sourceMode === 'paste'}
          onClick={() => setSourceMode('paste')}
            className={`!rounded-none border-b-2 px-4 py-3 text-sm font-bold transition ${
              sourceMode === 'paste'
              ? 'border-slate-950 text-slate-950'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}>
          粘贴书籍正文
        </button>
        <button
          type='button'
          role='tab'
          aria-selected={sourceMode === 'epub'}
          onClick={() => setSourceMode('epub')}
            className={`!rounded-none border-b-2 px-4 py-3 text-sm font-bold transition ${
              sourceMode === 'epub'
              ? 'border-slate-950 text-slate-950'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}>
          上传 EPUB
        </button>
      </div>

      <form
        action={sourceMode === 'paste' ? pasteAction : epubAction}
        className='space-y-6'>
        <section className='grid gap-4 border-y border-slate-200 py-5 md:grid-cols-2 md:py-6'>
          <label className='space-y-2'>
            <span className='text-sm font-bold text-slate-800'>书名</span>
            <input
              name='title'
              value={bookTitle}
              onChange={event => setBookTitle(event.currentTarget.value)}
              required={sourceMode === 'paste'}
              placeholder={sourceMode === 'paste' ? '例如：解析学入門' : '留空则使用 EPUB 书名'}
              className='h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
            />
          </label>
          <label className='space-y-2'>
            <span className='text-sm font-bold text-slate-800'>作者</span>
            <input
              name='author'
              placeholder='可选'
              disabled={sourceMode === 'epub'}
              className='h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:bg-slate-50 disabled:text-slate-400'
            />
          </label>
          <label className='space-y-2'>
            <span className='text-sm font-bold text-slate-800'>语言</span>
            <input
              name='language'
              defaultValue={defaultLanguage}
              disabled={sourceMode === 'epub'}
              className='h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:bg-slate-50 disabled:text-slate-400'
            />
          </label>
          <div className='space-y-2'>
            <span className='text-sm font-bold text-slate-800'>阅读集合</span>
            <CollectionBrowserSelect
              value={collectionId}
              onChange={setCollectionId}
              options={options}
              placeholder='可选：选择阅读集合'
              recentKey='ebook-import-collections'
            />
            <input type='hidden' name='collectionId' value={collectionId} />
          </div>
        </section>

        {sourceMode === 'paste' ? (
          <section className='overflow-hidden border-y border-slate-200 bg-white'>
            <div className='border-b border-slate-200 bg-slate-50/80 px-5 py-4 md:flex md:items-start md:justify-between md:gap-6'>
              <div>
                <h3 className='text-sm font-black text-slate-900'>书籍正文</h3>
                <p className='mt-1 text-xs leading-5 text-slate-500'>
                  使用 # 标记章节；行内公式写作 \(E=mc^2\)，独立公式使用 $$…$$。
                </p>
              </div>
              <div className='mt-3 flex gap-4 text-xs tabular-nums text-slate-500 md:mt-0'>
                <span>{preview.chapterCount} 章</span>
                <span>{preview.displayMathCount + preview.inlineMathCount} 个公式</span>
                <span>{bookContent.length.toLocaleString()} 字符</span>
              </div>
            </div>
            <textarea
              name='bookContent'
              value={bookContent}
              onChange={event => setBookContent(event.currentTarget.value)}
              required
              rows={20}
              placeholder={'# 第一章 集合与写像\n\n本文をここに貼り付けます。\n\n$$\\int_a^b f(x)\\,dx$$\n\n# 第二章 極限'}
              className='min-h-[32rem] w-full resize-y bg-white px-5 py-5 font-mono text-sm leading-7 text-slate-800 outline-none md:px-6'
            />
            <div className='grid gap-px border-t border-slate-200 bg-slate-200 text-xs sm:grid-cols-3'>
              <p className='bg-white px-4 py-3 text-slate-500'><strong className='text-slate-700'>章节</strong>　# 第一章</p>
              <p className='bg-white px-4 py-3 text-slate-500'><strong className='text-slate-700'>行内公式</strong>　\(x^2+y^2\)</p>
              <p className='bg-white px-4 py-3 text-slate-500'><strong className='text-slate-700'>独立公式</strong>　$$…$$</p>
            </div>
          </section>
        ) : (
          <section className='border-y border-dashed border-slate-300 bg-white p-6'>
            <label className='block cursor-pointer text-center'>
              <span className='block text-sm font-black text-slate-900'>选择 EPUB 文件</span>
              <span className='mt-1 block text-xs text-slate-500'>最大 80MB，自动读取书名、作者和章节</span>
              <input
                name='epubFile'
                type='file'
                accept='.epub,application/epub+zip'
                required
                className='mx-auto mt-4 block max-w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-2.5 file:text-sm file:font-bold file:text-white'
              />
            </label>
          </section>
        )}

        {activeState.message ? (
          <p
            className={`rounded-xl border px-4 py-3 text-sm ${
              activeState.success
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}>
            {activeState.message}
          </p>
        ) : null}

        <div className='flex items-center justify-between gap-4 border-t border-slate-200 pt-5'>
          <p className='text-xs leading-5 text-slate-500'>
            公式以结构化源码保存并在本地渲染；无法从图片自动恢复公式结构。
          </p>
          <button
            type='submit'
            disabled={pending}
            className='inline-flex h-12 shrink-0 items-center justify-center rounded-xl bg-slate-900 px-6 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-300'>
            {pending
              ? '导入中…'
              : sourceMode === 'paste'
                ? '创建电子书'
                : '导入 EPUB'}
          </button>
        </div>
      </form>
    </div>
  )
}
