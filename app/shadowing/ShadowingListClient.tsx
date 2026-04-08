'use client'

import Link from 'next/link'
import { useActionState, useMemo, useState } from 'react'

import ToggleSwitch from '@/components/ToggleSwitch'
import useEditMode from '@/hooks/useEditMode'
import {
  batchAssignShadowingMaterials,
  createShadowingBook,
  createShadowingChapter,
} from './actions'
import ShadowingQuickClassifyForm from './ShadowingQuickClassifyForm'

type ShadowingRow = {
  id: string
  materialId: string
  materialType: 'SPEAKING' | 'LISTENING' | 'READING' | 'VOCAB_GRAMMAR'
  title: string
  audioFile: string
  description: string
  transcript: string
  source: string
  language: string
  difficulty: string
  tags: string[]
  tagsText: string
  dialogueCount: number
  questionCount: number
  rootId: string | null
  bookId: string | null
  chapterId: string | null
  hierarchyPath: string[]
  pathLabel: string
  isClassified: boolean
}

type CollectionNode = {
  id: string
  title: string
  collectionType:
    | 'LIBRARY_ROOT'
    | 'BOOK'
    | 'CHAPTER'
    | 'PAPER'
    | 'CUSTOM_GROUP'
    | 'FAVORITES'
  parentId: string | null
  sortOrder: number
}

type Props = {
  rows: ShadowingRow[]
  collections: CollectionNode[]
  mode?: 'learn' | 'manage'
}

const initialState = { success: false, message: '' }

export default function ShadowingListClient({
  rows,
  collections,
  mode = 'learn',
}: Props) {
  const { isEditMode, setIsEditMode } = useEditMode()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'classified' | 'unclassified'
  >('all')
  const [bookFilter, setBookFilter] = useState<string>('all')
  const [chapterFilter, setChapterFilter] = useState<string>('all')
  const [openAssignMaterialId, setOpenAssignMaterialId] = useState<string | null>(null)
  const [selectedMap, setSelectedMap] = useState<Record<string, boolean>>({})
  const [batchChapterId, setBatchChapterId] = useState<string>('')

  const [bookState, createBookAction, creatingBook] = useActionState(
    async (_prev: typeof initialState, formData: FormData) =>
      createShadowingBook(formData),
    initialState,
  )
  const [chapterState, createChapterAction, creatingChapter] = useActionState(
    async (_prev: typeof initialState, formData: FormData) =>
      createShadowingChapter(formData),
    initialState,
  )
  const [batchState, batchAction, batching] = useActionState(
    async (_prev: typeof initialState, formData: FormData) =>
      batchAssignShadowingMaterials(formData),
    initialState,
  )

  const roots = useMemo(
    () =>
      collections
        .filter(item => item.collectionType === 'LIBRARY_ROOT')
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'zh-CN'),
        ),
    [collections],
  )

  const books = useMemo(
    () =>
      collections
        .filter(item => item.collectionType === 'BOOK')
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'zh-CN'),
        ),
    [collections],
  )

  const chapters = useMemo(
    () =>
      collections
        .filter(item => item.collectionType === 'CHAPTER')
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'zh-CN'),
        ),
    [collections],
  )

  const rootById = useMemo(
    () =>
      roots.reduce<Record<string, CollectionNode>>((acc, item) => {
        acc[item.id] = item
        return acc
      }, {}),
    [roots],
  )
  const bookById = useMemo(
    () =>
      books.reduce<Record<string, CollectionNode>>((acc, item) => {
        acc[item.id] = item
        return acc
      }, {}),
    [books],
  )

  const chapterOptions = useMemo(
    () =>
      chapters.map(chapter => {
        const book = chapter.parentId ? bookById[chapter.parentId] : undefined
        const root = book?.parentId ? rootById[book.parentId] : undefined
        const label = [root?.title, book?.title, chapter.title]
          .filter(Boolean)
          .join(' / ')
        return { id: chapter.id, label }
      }),
    [chapters, bookById, rootById],
  )

  const filteredChapterOptions = useMemo(() => {
    if (bookFilter === 'all') return chapterOptions
    return chapterOptions.filter(option => {
      const chapter = chapters.find(item => item.id === option.id)
      return chapter?.parentId === bookFilter
    })
  }, [bookFilter, chapterOptions, chapters])

  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      const keyword = search.trim().toLowerCase()
      if (keyword) {
        const haystack = `${row.title} ${row.audioFile} ${row.pathLabel}`.toLowerCase()
        if (!haystack.includes(keyword)) return false
      }

      if (statusFilter === 'classified' && !row.isClassified) return false
      if (statusFilter === 'unclassified' && row.isClassified) return false

      if (bookFilter !== 'all' && row.bookId !== bookFilter) return false
      if (chapterFilter !== 'all' && row.chapterId !== chapterFilter) return false

      return true
    })
  }, [rows, search, statusFilter, bookFilter, chapterFilter])

  const selectedIds = useMemo(
    () => filteredRows.filter(item => selectedMap[item.materialId]).map(item => item.materialId),
    [filteredRows, selectedMap],
  )

  const toggleSelect = (materialId: string, checked: boolean) => {
    setSelectedMap(prev => ({ ...prev, [materialId]: checked }))
  }

  const selectAllOnPage = (checked: boolean) => {
    const next: Record<string, boolean> = { ...selectedMap }
    filteredRows.forEach(item => {
      next[item.materialId] = checked
    })
    setSelectedMap(next)
  }

  const unclassifiedCount = rows.filter(item => !item.isClassified).length
  const isManageMode = mode === 'manage'

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 md:px-8 md:py-8'>
      <div className='mx-auto max-w-7xl'>
        <div className='mb-5 border border-slate-200 bg-white p-4 md:p-5'>
          <div className='mb-4 flex flex-wrap items-end justify-between gap-3'>
            <div>
              <h1 className='text-2xl font-black text-slate-900'>跟读材料</h1>
              <p className='mt-1 text-sm text-slate-500'>
                {isManageMode
                  ? '以管理与编辑为主，可快速完成“书 / 章节”归类并继续编辑听力材料。'
                  : '以开始跟读为主，在编辑模式下可高效完成“书 / 章节”归类。'}
              </p>
            </div>
            <div className='flex items-center gap-3'>
              <ToggleSwitch
                checked={isEditMode}
                onChange={setIsEditMode}
                label='编辑模式'
              />
              <Link
                href='/manage/upload'
                className='inline-flex h-10 items-center bg-blue-600 px-4 text-sm font-bold text-white transition-colors hover:bg-blue-700'>
                继续上传
              </Link>
            </div>
          </div>

          <div className='grid grid-cols-1 gap-2 md:grid-cols-[1.2fr_repeat(4,minmax(0,1fr))]'>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder='搜索标题 / 音频 / 路径'
              className='h-10 border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
            />
            <select
              value={statusFilter}
              onChange={e =>
                setStatusFilter(e.target.value as 'all' | 'classified' | 'unclassified')
              }
              className='h-10 border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'>
              <option value='all'>全部状态</option>
              <option value='unclassified'>未归类</option>
              <option value='classified'>已归类</option>
            </select>
            <select
              value={bookFilter}
              onChange={e => {
                setBookFilter(e.target.value)
                setChapterFilter('all')
              }}
              className='h-10 border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'>
              <option value='all'>全部书籍</option>
              {books.map(item => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            <select
              value={chapterFilter}
              onChange={e => setChapterFilter(e.target.value)}
              className='h-10 border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'>
              <option value='all'>全部章节</option>
              {filteredChapterOptions.map(item => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <button
              type='button'
              onClick={() => {
                setSearch('')
                setStatusFilter('all')
                setBookFilter('all')
                setChapterFilter('all')
              }}
              className='h-10 border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100'>
              重置筛选
            </button>
          </div>

          <p className='mt-2 text-xs font-semibold text-slate-500'>
            共 {rows.length} 条 · 未归类 {unclassifiedCount} 条 · 当前显示 {filteredRows.length} 条
          </p>
        </div>

        {isEditMode ? (
          <div className='mb-4 space-y-3'>
            <div className='grid grid-cols-1 gap-2 border border-blue-100 bg-blue-50/50 p-3 md:grid-cols-[1fr_1fr_auto]'>
              <form action={createBookAction} className='contents'>
                <select
                  name='rootId'
                  className='h-9 border border-blue-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none'>
                  <option value=''>选择上级分类（LIBRARY_ROOT）</option>
                  {roots.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <input
                  name='bookTitle'
                  placeholder='新建书名（BOOK）'
                  className='h-9 border border-blue-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none'
                />
                <button
                  type='submit'
                  disabled={creatingBook}
                  className='h-9 border border-blue-200 bg-white px-3 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-60'>
                  {creatingBook ? '创建中...' : '新建书'}
                </button>
              </form>
              {bookState.message ? (
                <p className={`text-xs font-semibold ${bookState.success ? 'text-blue-700' : 'text-rose-600'}`}>
                  {bookState.message}
                </p>
              ) : null}
            </div>

            <div className='grid grid-cols-1 gap-2 border border-blue-100 bg-blue-50/50 p-3 md:grid-cols-[1fr_1fr_auto]'>
              <form action={createChapterAction} className='contents'>
                <select
                  name='bookId'
                  className='h-9 border border-blue-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none'>
                  <option value=''>选择所属书（BOOK）</option>
                  {books.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <input
                  name='chapterTitle'
                  placeholder='新建章节名（CHAPTER）'
                  className='h-9 border border-blue-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none'
                />
                <button
                  type='submit'
                  disabled={creatingChapter}
                  className='h-9 border border-blue-200 bg-white px-3 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-60'>
                  {creatingChapter ? '创建中...' : '新建章节'}
                </button>
              </form>
              {chapterState.message ? (
                <p className={`text-xs font-semibold ${chapterState.success ? 'text-blue-700' : 'text-rose-600'}`}>
                  {chapterState.message}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {isEditMode && selectedIds.length > 0 ? (
          <form
            action={batchAction}
            className='mb-4 grid grid-cols-1 gap-2 border border-amber-200 bg-amber-50 p-3 md:grid-cols-[1.4fr_auto_auto]'>
            <input type='hidden' name='materialIds' value={selectedIds.join(',')} />
            <select
              name='chapterId'
              value={batchChapterId}
              onChange={e => setBatchChapterId(e.target.value)}
              className='h-9 border border-amber-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none'>
              <option value=''>选择目标章节</option>
              {chapterOptions.map(item => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <button
              type='submit'
              name='mode'
              value='assign'
              disabled={batching || !batchChapterId}
              className='h-9 border border-amber-300 bg-white px-3 text-xs font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-60'>
              {batching ? '处理中...' : `批量归类（${selectedIds.length}）`}
            </button>
            <button
              type='submit'
              name='mode'
              value='clear'
              disabled={batching}
              className='h-9 border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-60'>
              设为未归类
            </button>
            {batchState.message ? (
              <p className={`text-xs font-semibold ${batchState.success ? 'text-blue-700' : 'text-rose-600'}`}>
                {batchState.message}
              </p>
            ) : null}
          </form>
        ) : null}

        {rows.length === 0 ? (
          <div className='border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500'>
            暂无跟读材料，请先在上传中心导入听力。
          </div>
        ) : (
          <div className='grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]'>
            <aside className='hidden h-fit border border-slate-200 bg-white p-3 lg:block'>
              <button
                type='button'
                onClick={() => {
                  setBookFilter('all')
                  setChapterFilter('all')
                }}
                className='mb-2 w-full border border-slate-200 px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50'>
                全部书籍 / 章节
              </button>
              {books.map(book => {
                const chapterRows = chapters.filter(ch => ch.parentId === book.id)
                return (
                  <div key={book.id} className='mb-2 border border-slate-100 p-2'>
                    <button
                      type='button'
                      onClick={() => {
                        setBookFilter(book.id)
                        setChapterFilter('all')
                      }}
                      className='w-full text-left text-sm font-bold text-slate-800 hover:text-blue-700'>
                      {book.title}
                    </button>
                    <div className='mt-1 space-y-1 pl-2'>
                      {chapterRows.map(ch => (
                        <button
                          key={ch.id}
                          type='button'
                          onClick={() => {
                            setBookFilter(book.id)
                            setChapterFilter(ch.id)
                          }}
                          className='block w-full text-left text-xs text-slate-600 hover:text-blue-700'>
                          {ch.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </aside>

            <section>
              {isEditMode ? (
                <div className='mb-3 flex items-center gap-2'>
                  <input
                    type='checkbox'
                    checked={
                      filteredRows.length > 0 &&
                      filteredRows.every(item => selectedMap[item.materialId])
                    }
                    onChange={e => selectAllOnPage(e.target.checked)}
                    className='h-4 w-4'
                  />
                  <span className='text-xs font-semibold text-slate-600'>
                    全选当前筛选结果
                  </span>
                </div>
              ) : null}

              <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3'>
                {filteredRows.map(item => {
                  const statusText = item.isClassified ? '已归类' : '未归类'
                  const statusStyle = item.isClassified
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                    : 'bg-amber-50 text-amber-700 border-amber-100'

                  return (
                    <article
                      key={item.id}
                      className='border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-blue-200'>
                      <div className='mb-2 flex items-start justify-between gap-2'>
                        <div className='min-w-0'>
                          <h2 className='line-clamp-2 text-base font-black text-slate-900'>
                            {item.title}
                          </h2>
                          <p className='mt-1 text-xs font-semibold text-slate-500'>
                            句子 {item.dialogueCount}
                          </p>
                        </div>
                        {isEditMode ? (
                          <input
                            type='checkbox'
                            checked={Boolean(selectedMap[item.materialId])}
                            onChange={e => toggleSelect(item.materialId, e.target.checked)}
                            className='mt-1 h-4 w-4 shrink-0'
                          />
                        ) : null}
                      </div>

                      <p className='line-clamp-2 text-xs text-slate-500'>
                        路径：{item.pathLabel}
                      </p>
                      <p className='mt-1 line-clamp-1 text-xs text-slate-500'>
                        音频：{item.audioFile || '未设置'}
                      </p>

                      <div className='mt-3 flex items-center justify-between gap-2'>
                        <span
                          className={`rounded border px-2 py-0.5 text-[11px] font-bold ${statusStyle}`}>
                          {statusText}
                        </span>
                        <button
                          type='button'
                          onClick={() =>
                            setOpenAssignMaterialId(prev =>
                              prev === item.materialId ? null : item.materialId,
                            )
                          }
                          className='text-xs font-semibold text-blue-700 hover:text-blue-800'>
                          {item.isClassified ? '重新归类' : '立即归类'}
                        </button>
                      </div>

                      <div className='mt-3'>
                        <Link
                          href={
                            isManageMode
                              ? `/manage/shadowing/${item.id}`
                              : `/shadowing/${item.id}`
                          }
                          className='inline-flex h-10 w-full items-center justify-center bg-blue-600 px-4 text-sm font-bold text-white transition-colors hover:bg-blue-700'>
                          {isManageMode ? '继续编辑听力材料' : '开始跟读'}
                        </Link>
                      </div>

                      {isEditMode && openAssignMaterialId === item.materialId ? (
                        <div className='mt-3 border-t border-slate-100 pt-3'>
                          <ShadowingQuickClassifyForm
                            legacyId={item.id}
                            materialId={item.materialId}
                            currentChapterId={item.chapterId || ''}
                            chapterOptions={chapterOptions}
                          />
                        </div>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
