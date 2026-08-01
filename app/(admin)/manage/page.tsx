import Link from 'next/link'

const entries = [
  ['内容导入', '听力、跟读、阅读与题目的统一录入入口', '/manage/import'],
  ['内容分类', '维护集合层级与材料归属', '/manage/collections'],
  ['试卷', '维护正式试卷的分区、题目与解析', '/manage/practice'],
  ['音频材料', '筛选、归类和编辑听力与跟读材料', '/manage/listening'],
  ['词汇管理', '合并重复词条并修正词汇资料', '/manage/vocabulary'],
  ['语法管理', '创建语法、接续、标签和相似组', '/manage/grammar'],
  ['系统维护', '检查录音文件与复习调度数据', '/manage/system'],
] as const

export default function ManageHomePage() {
  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 md:px-6 md:py-10'>
      <div className='mx-auto max-w-5xl'>
        <header className='border-b border-slate-200 pb-6'>
          <h1 className='text-3xl font-black tracking-tight text-slate-950'>
            内容管理
          </h1>
          <p className='mt-2 text-sm leading-6 text-slate-600'>
            导入和维护学习内容。
          </p>
        </header>
        <nav
          aria-label='管理功能'
          className='mt-6 grid gap-3 md:grid-cols-2'>
          {entries.map(([title, description, href]) => (
            <Link
              key={href}
              href={href}
              className='border-t border-slate-200 py-5 transition hover:bg-white md:px-4'>
              <h2 className='text-base font-bold text-slate-950'>{title}</h2>
              <p className='mt-2 text-sm leading-6 text-slate-500'>{description}</p>
            </Link>
          ))}
        </nav>
      </div>
    </main>
  )
}
