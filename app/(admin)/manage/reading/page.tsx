import Link from 'next/link'

import { listReadingMaterials } from '@/lib/repositories/materials'

export default async function ManageReadingPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  const params = await searchParams
  const q = (params.q || '').trim().toLowerCase()
  const status = params.status || 'all'
  const rows = await listReadingMaterials()
  const filtered = rows.filter(item => {
    const isEbook = item.sourceKind === 'EPUB'
    if (q && !`${item.title} ${item.author} ${item.description}`.toLowerCase().includes(q)) return false
    if (status === 'missingQuestions' && (isEbook || item.questionCount > 0)) return false
    if (status === 'hasQuestions' && (isEbook || item.questionCount === 0)) return false
    if (status === 'ebooks' && !isEbook) return false
    return true
  })
  const articleRows = rows.filter(item => item.sourceKind !== 'EPUB')
  const ebookRows = rows.filter(item => item.sourceKind === 'EPUB')
  const missingQuestions = articleRows.filter(item => item.questionCount === 0).length

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 md:px-8 md:py-8'>
      <div className='mx-auto max-w-7xl space-y-4'>
        <section className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5'>
          <div className='flex flex-wrap items-end justify-between gap-3'>
            <div>
              <h1 className='text-2xl font-black text-slate-900'>阅读材料</h1>
              <p className='mt-1 text-sm text-slate-500'>维护文章正文与题目，并管理无需题目的 EPUB 电子书。</p>
            </div>
            <Link href='/manage/import?type=reading' className='ui-btn ui-btn-primary h-10 px-4 text-sm font-bold'>导入阅读</Link>
          </div>
          <form className='mt-4 grid gap-2 md:grid-cols-[minmax(260px,1fr)_220px_auto]'>
            <input name='q' defaultValue={params.q || ''} placeholder='搜索标题 / 作者 / 简介' className='h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200' />
            <select name='status' defaultValue={status} className='h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm'>
              <option value='all'>全部状态</option>
              <option value='missingQuestions'>缺少题目</option>
              <option value='hasQuestions'>已有题目</option>
              <option value='ebooks'>电子书</option>
            </select>
            <button className='ui-btn ui-btn-sm h-10 px-4'>筛选</button>
          </form>
          <p className='mt-2 text-xs font-semibold text-slate-500'>文章 {articleRows.length} 篇 · 电子书 {ebookRows.length} 本 · 文章缺题 {missingQuestions} 篇 · 当前显示 {filtered.length} 项</p>
        </section>

        <section className='space-y-2'>
          {filtered.length === 0 ? (
            <div className='rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500'>当前筛选条件下暂无阅读材料。</div>
          ) : filtered.map(item => {
            const isEbook = item.sourceKind === 'EPUB'
            return (
            <article key={item.id} className='grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center'>
              <div className='min-w-0'>
                <div className='flex flex-wrap items-center gap-2'>
                  <h2 className='font-bold text-slate-900'>{item.title}</h2>
                  <span className={`rounded border px-2 py-0.5 text-[11px] font-bold ${isEbook ? 'border-blue-100 bg-blue-50 text-blue-700' : item.questionCount === 0 ? 'border-rose-100 bg-rose-50 text-rose-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700'}`}>
                    {isEbook ? `${item.chapterCount} 个章节` : item.questionCount === 0 ? '缺少题目' : `${item.questionCount} 题`}
                  </span>
                </div>
                <p className='mt-1 truncate text-xs text-slate-500'>{item.paper?.name || '未归类'} · {item.author || '作者未设置'} · {item.chapterCount || 1} 节</p>
              </div>
              <div className='flex gap-2'>
                {!isEbook ? <Link href={`/manage/reading/${item.id}`} className={`ui-btn ui-btn-sm ${item.questionCount === 0 ? 'ui-btn-primary' : ''}`}>{item.questionCount === 0 ? '添加题目' : '编辑文章'}</Link> : null}
                <Link href={isEbook ? `/reading/ebooks/${item.id}` : `/reading/articles/${item.id}`} className='ui-btn ui-btn-sm'>{isEbook ? '阅读' : '预览'}</Link>
              </div>
            </article>
          )})}
        </section>
      </div>
    </main>
  )
}
