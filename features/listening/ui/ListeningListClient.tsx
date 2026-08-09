'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import ListeningQuickClassifyForm from '@/features/listening/ui/ListeningQuickClassifyForm'
import CustomSelect from '@/components/ui/CustomSelect'
import DeleteAudioMaterialButton from '@/features/listening/ui/DeleteAudioMaterialButton'
import { useListeningListState } from '@/features/listening/hooks/useListeningListState'
import { useListeningListMutations } from '@/features/listening/hooks/useListeningListMutations'
import { useListeningListQuery } from '@/features/listening/hooks/useListeningListQuery'
import type { CollectionNode, ShadowingRow } from '@/features/listening/domain/listening-list'

type Props = {
  rows: ShadowingRow[]
  collections: CollectionNode[]
  mode?: 'learn' | 'manage'
  workspace?: 'mixed' | 'listening' | 'shadowing'
}


export default function ListeningListClient({
  rows,
  collections,
  mode = 'learn',
  workspace = 'mixed',
}: Props) {
  const isManageMode = mode === 'manage'
  const isEditMode = isManageMode
  const isListeningWorkspace = isManageMode && workspace === 'listening'
  const isShadowingWorkspace = isManageMode && workspace === 'shadowing'
  const {
    search, setSearch, statusFilter, setStatusFilter, materialTypeFilter,
    setMaterialTypeFilter, bookFilter, setBookFilter, chapterFilter,
    setChapterFilter, paperFilter, setPaperFilter, openAssignMaterialId,
    setOpenAssignMaterialId, selectedMap, setSelectedMap, batchChapterId,
    setBatchChapterId, managePage, setManagePage,
  } = useListeningListState()
  const {
    bookState, createBookAction, creatingBook, chapterState,
    createChapterAction, creatingChapter, batchState, batchAction, batching,
  } = useListeningListMutations()
  const {
    roots, books, chapters, papers, chapterOptions, filteredChapterOptions,
    filteredRows, sortedRows: chapterSortedRows, visibleManageRows,
    totalPages: manageTotalPages, normalizedPage: normalizedManagePage, counts,
  } = useListeningListQuery({
    rows, collections, search, statusFilter, materialTypeFilter, bookFilter,
    chapterFilter, paperFilter, workspace, managePage,
  })

  const selectedIds = useMemo(
    () =>
      filteredRows
        .filter(item => selectedMap[item.materialId] && !item.isExamMaterial)
        .map(item => item.materialId),
    [filteredRows, selectedMap],
  )

  const toggleSelect = (materialId: string, checked: boolean) => {
    setSelectedMap(prev => ({ ...prev, [materialId]: checked }))
  }

  const selectAllOnPage = (checked: boolean) => {
    const next: Record<string, boolean> = { ...selectedMap }
    const targetRows = (isManageMode ? visibleManageRows : filteredRows).filter(
      item => !item.isExamMaterial,
    )
    targetRows.forEach(item => {
      next[item.materialId] = checked
    })
    setSelectedMap(next)
  }

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 md:px-8 md:py-8'>
      <div className='mx-auto max-w-7xl'>
        <div className='mb-5 rounded-[20px] bg-white p-4 shadow-[0_1px_5px_-4px_rgba(15,23,42,0.35),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)] md:p-5'>
          <div className='mb-4 flex flex-wrap items-end justify-between gap-3'>
            <div>
              <h1 className='text-2xl font-black text-slate-900'>
                {isListeningWorkspace
                  ? '听力材料'
                  : isShadowingWorkspace
                    ? '跟读材料'
                    : '跟读材料'}
              </h1>
              <p className='mt-1 text-sm text-slate-500'>
                {isListeningWorkspace
                  ? '检查所属试卷、問題与题目完整性。'
                  : isShadowingWorkspace
                    ? '按教材和章节维护跟读音频、字幕与归类。'
                    : '以开始跟读为主，在编辑模式下完成教材与章节归类。'}
              </p>
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              {isListeningWorkspace ? (
                <Link
                  href='/manage/import?type=listening'
                  className='ui-btn ui-btn-primary h-10 px-4 text-sm font-bold'>
                  导入听力
                </Link>
              ) : (
                <Link
                  href='/manage/import?type=speaking'
                  className='ui-btn ui-btn-primary h-10 px-4 text-sm font-bold'>
                  导入跟读
                </Link>
              )}
            </div>
          </div>

          <div className={`grid grid-cols-1 gap-2 ${
            isListeningWorkspace
              ? 'md:grid-cols-[minmax(260px,1.4fr)_1fr_1fr_auto]'
              : isShadowingWorkspace
                ? 'md:grid-cols-[minmax(220px,1.3fr)_0.8fr_1fr_1fr_auto]'
                : 'md:grid-cols-[1.2fr_repeat(5,minmax(0,1fr))]'
          }`}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder='搜索标题 / 音频 / 路径'
              className='h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none shadow-[inset_0_1px_1px_rgba(15,23,42,0.04)] focus:border-slate-400 focus:ring-2 focus:ring-slate-200'
            />
            <CustomSelect
              value={statusFilter}
              onChange={e =>
                setStatusFilter(
                  e.target.value as
                    | 'all'
                    | 'ready'
                    | 'needsQuestion'
                    | 'needsSection'
                    | 'classified'
                    | 'unclassified',
                )
              }
              className='h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none shadow-[inset_0_1px_1px_rgba(15,23,42,0.04)] focus:border-slate-400 focus:ring-2 focus:ring-slate-200'>
              <option value='all'>全部状态</option>
              {isListeningWorkspace ? (
                <>
                  <option value='needsQuestion'>缺少题目</option>
                  <option value='needsSection'>未设置所属問題</option>
                  <option value='ready'>题目完整</option>
                </>
              ) : (
                <>
                  <option value='unclassified'>未归类</option>
                  <option value='classified'>已归类</option>
                </>
              )}
            </CustomSelect>
            {isListeningWorkspace ? (
              <CustomSelect
                value={paperFilter}
                onChange={e => setPaperFilter(e.target.value)}
                className='h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none'>
                <option value='all'>全部试卷</option>
                {papers.map(item => (
                  <option key={item.id} value={item.id}>{item.title}</option>
                ))}
              </CustomSelect>
            ) : isShadowingWorkspace ? (
              <>
                <CustomSelect
                  value={bookFilter}
                  onChange={e => {
                    setBookFilter(e.target.value)
                    setChapterFilter('all')
                  }}
                  className='h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none shadow-[inset_0_1px_1px_rgba(15,23,42,0.04)] focus:border-slate-400 focus:ring-2 focus:ring-slate-200'>
                  <option value='all'>全部书籍</option>
                  {books.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </CustomSelect>
                <CustomSelect
                  value={chapterFilter}
                  onChange={e => setChapterFilter(e.target.value)}
                  className='h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none shadow-[inset_0_1px_1px_rgba(15,23,42,0.04)] focus:border-slate-400 focus:ring-2 focus:ring-slate-200'>
                  <option value='all'>全部章节</option>
                  {filteredChapterOptions.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </CustomSelect>
              </>
            ) : (
              <CustomSelect
                value={materialTypeFilter}
                onChange={e =>
                  setMaterialTypeFilter(
                    e.target.value as 'all' | 'SPEAKING' | 'LISTENING',
                  )
                }
                className='h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none'>
                <option value='all'>全部类型</option>
                <option value='SPEAKING'>跟读材料</option>
                <option value='LISTENING'>听力材料</option>
              </CustomSelect>
            )}
            <button
              type='button'
              onClick={() => {
                setSearch('')
                setStatusFilter('all')
                setMaterialTypeFilter('all')
                setBookFilter('all')
                setChapterFilter('all')
                setPaperFilter('all')
              }}
              className='ui-btn ui-btn-sm h-10 px-3 text-sm font-semibold'>
              重置筛选
            </button>
          </div>

          <p className='mt-2 text-xs font-semibold text-slate-500'>
            {isListeningWorkspace
              ? `共 ${counts.listening} 条 · 缺题 ${counts.needsQuestion} 条 · 缺所属問題 ${counts.needsSection} 条`
              : `共 ${counts.speaking} 条 · 未归类 ${counts.unclassified} 条`}
            {' '}· 当前显示 {filteredRows.length} 条
          </p>
        </div>

        {isShadowingWorkspace ? (
          <details className='group mb-4 rounded-[18px] bg-white shadow-[0_1px_5px_-4px_rgba(15,23,42,0.35),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)]'>
            <summary className='flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 marker:content-none'>
              管理书籍与章节
              <span className='text-xs text-slate-400 group-open:hidden'>展开</span>
              <span className='hidden text-xs text-slate-400 group-open:inline'>收起</span>
            </summary>
          <div className='space-y-3 border-t border-slate-200 p-3'>
            <div className='grid grid-cols-1 gap-2 rounded-[18px] bg-white p-3 shadow-[0_1px_5px_-4px_rgba(15,23,42,0.35),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)] md:grid-cols-[1fr_1fr_auto]'>
              <form action={createBookAction} className='contents'>
                <CustomSelect
                  name='rootId'
                  className='h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none shadow-[inset_0_1px_1px_rgba(15,23,42,0.04)]'>
                  <option value=''>选择上级分类（LIBRARY_ROOT）</option>
                  {roots.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </CustomSelect>
                <input
                  name='bookTitle'
                  placeholder='新建书名（BOOK）'
                  className='h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none shadow-[inset_0_1px_1px_rgba(15,23,42,0.04)]'
                />
                <button
                  type='submit'
                  disabled={creatingBook}
                  className='ui-btn ui-btn-sm ui-btn-primary h-9 px-3 disabled:opacity-60'>
                  {creatingBook ? '创建中...' : '新建书'}
                </button>
              </form>
              {bookState.message ? (
                <p
                  className={`text-xs font-semibold ${bookState.success ? 'text-slate-700' : 'text-rose-600'}`}>
                  {bookState.message}
                </p>
              ) : null}
            </div>

            <div className='grid grid-cols-1 gap-2 rounded-[18px] bg-white p-3 shadow-[0_1px_5px_-4px_rgba(15,23,42,0.35),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)] md:grid-cols-[1fr_1fr_auto]'>
              <form action={createChapterAction} className='contents'>
                <CustomSelect
                  name='bookId'
                  className='h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none shadow-[inset_0_1px_1px_rgba(15,23,42,0.04)]'>
                  <option value=''>选择所属书（BOOK）</option>
                  {books.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </CustomSelect>
                <input
                  name='chapterTitle'
                  placeholder='新建章节名（CHAPTER）'
                  className='h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none shadow-[inset_0_1px_1px_rgba(15,23,42,0.04)]'
                />
                <button
                  type='submit'
                  disabled={creatingChapter}
                  className='ui-btn ui-btn-sm ui-btn-primary h-9 px-3 disabled:opacity-60'>
                  {creatingChapter ? '创建中...' : '新建章节'}
                </button>
              </form>
              {chapterState.message ? (
                <p
                  className={`text-xs font-semibold ${chapterState.success ? 'text-slate-700' : 'text-rose-600'}`}>
                  {chapterState.message}
                </p>
              ) : null}
            </div>
          </div>
          </details>
        ) : null}

        {isShadowingWorkspace && selectedIds.length > 0 ? (
          <form
            action={batchAction}
            className='mb-4 grid grid-cols-1 gap-2 rounded-[18px] bg-white p-3 shadow-[0_1px_5px_-4px_rgba(15,23,42,0.35),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)] md:grid-cols-[1.4fr_auto_auto]'>
            <input
              type='hidden'
              name='materialIds'
              value={selectedIds.join(',')}
            />
            <CustomSelect
              name='chapterId'
              value={batchChapterId}
              onChange={e => setBatchChapterId(e.target.value)}
              className='h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none shadow-[inset_0_1px_1px_rgba(15,23,42,0.04)]'>
              <option value=''>选择目标章节</option>
              {chapterOptions.map(item => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </CustomSelect>
            <button
              type='submit'
              name='mode'
              value='assign'
              disabled={batching || !batchChapterId}
              className='ui-btn ui-btn-sm ui-btn-primary h-9 px-3 disabled:opacity-60'>
              {batching ? '处理中...' : `批量归类（${selectedIds.length}）`}
            </button>
            <button
              type='submit'
              name='mode'
              value='clear'
              disabled={batching}
              className='ui-btn ui-btn-sm h-9 px-3 disabled:opacity-60'>
              设为未归类
            </button>
            {batchState.message ? (
              <p
                className={`text-xs font-semibold ${batchState.success ? 'text-slate-700' : 'text-rose-600'}`}>
                {batchState.message}
              </p>
            ) : null}
          </form>
        ) : null}

        {rows.length === 0 ? (
          <div className='border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500'>
            暂无音频材料，请先从导入页添加。
          </div>
        ) : isManageMode ? (
          <section>
            <div className='mb-3 flex items-center gap-2'>
              {isShadowingWorkspace && (
                <>
                  <input
                    type='checkbox'
                    checked={
                      visibleManageRows.length > 0 &&
                      visibleManageRows.every(item => selectedMap[item.materialId])
                    }
                    onChange={e => selectAllOnPage(e.target.checked)}
                    className='h-4 w-4'
                  />
                  <span className='text-xs font-semibold text-slate-600'>
                    全选当前页
                  </span>
                </>
              )}
              <div className='ml-auto flex items-center gap-2'>
                <span className='text-xs text-slate-500'>
                  第 {normalizedManagePage}/{manageTotalPages} 页
                </span>
                <button
                  type='button'
                  disabled={normalizedManagePage <= 1}
                  onClick={() => setManagePage(page => Math.max(1, page - 1))}
                  className='ui-btn ui-btn-sm disabled:opacity-40'>
                  上一页
                </button>
                <button
                  type='button'
                  disabled={normalizedManagePage >= manageTotalPages}
                  onClick={() =>
                    setManagePage(page => Math.min(manageTotalPages, page + 1))
                  }
                  className='ui-btn ui-btn-sm disabled:opacity-40'>
                  下一页
                </button>
              </div>
            </div>

            {chapterSortedRows.length === 0 ? (
              <div className='border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500'>
                当前筛选条件下暂无材料。
              </div>
            ) : (
              <div className='space-y-2'>
                {visibleManageRows.map(item => {
                  const statusText = item.needsQuestion
                    ? '缺少题目'
                    : item.needsSection
                      ? '未设置所属問題'
                      : isListeningWorkspace
                        ? item.isExamMaterial
                          ? '已关联试卷'
                          : '未关联试卷'
                        : item.isClassified
                          ? '已归类'
                          : '未归类'
                  const statusStyle = item.needsQuestion || item.needsSection
                    ? 'bg-rose-50 text-rose-700 border-rose-100'
                    : item.isClassified
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                      : 'bg-amber-50 text-amber-700 border-amber-100'
                  const sectionLabel = item.isExamMaterial
                    ? item.listeningSectionNumber
                      ? `問題${item.listeningSectionNumber}`
                      : '未设置所属問題'
                    : (item.chapterName || '').trim() || '未设置章节'
                  const examManageHref = item.collectionId
                    ? item.listeningSectionNumber
                      ? `/manage/practice/${item.collectionId}?section=${encodeURIComponent(`LISTENING:listening-part-${item.listeningSectionNumber}`)}`
                      : `/manage/practice/${item.collectionId}`
                    : '/manage/practice'

                  return (
                    <article
                      key={item.id}
                      className={`rounded-xl bg-white p-3 shadow-sm md:p-4 ${
                        item.needsQuestion
                          ? 'border border-rose-200 ring-1 ring-rose-50'
                          : 'border border-slate-200'
                      }`}>
                      <div className='grid min-w-0 gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center'>
                        {isListeningWorkspace || item.isExamMaterial ? (
                          <span
                            aria-hidden='true'
                            className='h-4 w-4 shrink-0 rounded-full bg-indigo-100'
                          />
                        ) : (
                          <input
                            type='checkbox'
                            aria-label={`选择 ${item.title}`}
                            checked={Boolean(selectedMap[item.materialId])}
                            onChange={e =>
                              toggleSelect(item.materialId, e.target.checked)
                            }
                            className='h-4 w-4 shrink-0'
                          />
                        )}
                        <div className='min-w-0'>
                          <div className='flex flex-wrap items-center gap-2'>
                            <h3 className='text-sm font-bold text-slate-900 md:text-base'>
                              {item.title}
                            </h3>
                            <span className='rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600'>
                              {sectionLabel}
                            </span>
                            <span className='rounded border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600'>
                              {item.materialType === 'LISTENING' ? '听力' : '跟读'}
                            </span>
                            <span className={`rounded border px-2 py-0.5 text-[11px] font-bold ${statusStyle}`}>
                              {statusText}
                            </span>
                          </div>
                          <p className='mt-1 truncate text-xs text-slate-500'>
                            {item.pathLabel} · 字幕 {item.dialogueCount} 句 · 题目 {item.questionCount} 道 · {item.audioFile || '音频未设置'}
                          </p>
                        </div>
                        <div className='flex flex-wrap items-center justify-start gap-2 md:justify-end'>
                          {item.materialType === 'LISTENING' ? (
                            <>
                              <Link
                                href={`/manage/listening/${item.id}#questions`}
                                className={`ui-btn ui-btn-sm ${
                                  item.needsQuestion ? 'ui-btn-primary' : ''
                                }`}>
                                {item.needsQuestion ? '添加题目' : '管理题目'}
                              </Link>
                              {item.isExamMaterial ? (
                                <Link href={examManageHref} className='ui-btn ui-btn-sm'>
                                  整卷管理
                                </Link>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <button
                                type='button'
                                onClick={() =>
                                  setOpenAssignMaterialId(prev =>
                                    prev === item.materialId
                                      ? null
                                      : item.materialId,
                                  )
                                }
                                className='ui-btn ui-btn-sm'>
                                {item.isClassified ? '重新归类' : '立即归类'}
                              </button>
                              <Link
                                href={`/manage/shadowing/${item.id}`}
                                className='ui-btn ui-btn-sm ui-btn-primary'>
                                编辑材料
                              </Link>
                            </>
                          )}
                          <Link
                            href={`/listening/${item.id}`}
                            className='ui-btn ui-btn-sm'>
                            试听
                          </Link>
                          <DeleteAudioMaterialButton
                            id={item.id}
                            title={item.title}
                            materialType={
                              item.materialType === 'LISTENING'
                                ? 'LISTENING'
                                : 'SPEAKING'
                            }
                            questionCount={item.questionCount}
                            collectionLabel={item.pathLabel}
                            isExamMaterial={item.isExamMaterial}
                          />
                        </div>
                      </div>

                      {isShadowingWorkspace && openAssignMaterialId === item.materialId ? (
                        <div className='mt-3 border-t border-slate-100 pt-3'>
                          <ListeningQuickClassifyForm
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
            )}
          </section>
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
                const chapterRows = chapters.filter(
                  ch => ch.parentId === book.id,
                )
                return (
                  <div
                    key={book.id}
                    className='mb-2 rounded-xl border border-slate-100 p-2'>
                    <button
                      type='button'
                      onClick={() => {
                        setBookFilter(book.id)
                        setChapterFilter('all')
                      }}
                      className='w-full text-left text-sm font-bold text-slate-800 hover:text-slate-900'>
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
                          className='block w-full text-left text-xs text-slate-600 hover:text-slate-900'>
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
                      className='rounded-[18px] bg-white p-4 shadow-[0_1px_5px_-4px_rgba(15,23,42,0.35),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-18px_rgba(15,23,42,0.35)]'>
                      <div className='mb-2 flex items-start justify-between gap-2'>
                        <div className='min-w-0'>
                          <div className='flex items-center gap-2'>
                            <span className='inline-flex shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700'>
                              {(item.chapterName || '').trim() || '未设置章节'}
                            </span>
                            <span
                              className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                item.materialType === 'LISTENING'
                                  ? 'border-slate-200 bg-slate-50 text-slate-700'
                                  : 'border-slate-200 bg-white text-slate-700'
                              }`}>
                              {item.materialType === 'LISTENING'
                                ? '听力'
                                : '跟读'}
                            </span>
                            <h3 className='line-clamp-2 text-base font-black text-slate-900'>
                              {item.title}
                            </h3>
                          </div>
                          <p className='mt-1 text-xs font-semibold text-slate-500'>
                            句子 {item.dialogueCount}
                          </p>
                        </div>
                        {isEditMode ? (
                          <input
                            type='checkbox'
                            checked={Boolean(selectedMap[item.materialId])}
                            onChange={e =>
                              toggleSelect(item.materialId, e.target.checked)
                            }
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
                            className='text-xs font-semibold text-slate-600 hover:text-slate-900'>
                            {item.isClassified ? '重新归类' : '立即归类'}
                          </button>
                      </div>

                      <div className='mt-3'>
                          <Link
                            href={
                              isManageMode && item.materialType === 'SPEAKING'
                                ? `/manage/shadowing/${item.id}`
                                : `/listening/${item.id}`
                            }
                            className='ui-btn ui-btn-primary h-10 w-full px-4 text-sm font-bold'>
                            {isManageMode && item.materialType === 'SPEAKING'
                              ? '编辑跟读材料'
                              : '开始跟读'}
                          </Link>
                      </div>

                      {isEditMode &&
                      openAssignMaterialId === item.materialId ? (
                        <div className='mt-3 border-t border-slate-100 pt-3'>
                          <ListeningQuickClassifyForm
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
