import Link from 'next/link'

const tools = [
  {
    href: '/manage/system/audio',
    title: '录音文件',
    description: '检查音频文件、引用关系与未使用资源。',
  },
  {
    href: '/manage/system/review',
    title: '复习调度',
    description: '查看 FSRS 状态、到期记录和调度数据。',
  },
]

export default function ManageSystemPage() {
  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 md:px-6 md:py-8'>
      <div className='mx-auto max-w-5xl'>
        <header className='border-b border-slate-200 pb-5 md:pb-6'>
          <p className='text-xs font-black tracking-[0.18em] text-slate-400 uppercase'>系统管理</p>
          <h1 className='mt-1 text-3xl font-black'>系统维护</h1>
          <p className='mt-2 text-sm text-slate-600'>检查文件和复习数据。</p>
        </header>
        <section className='mt-6 grid border-y border-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-slate-200'>
          {tools.map(tool => (
            <Link
              key={tool.href}
              href={tool.href}
              className='border-b border-slate-200 bg-white p-5 transition hover:bg-slate-50 last:border-b-0 sm:border-b-0'>
              <h2 className='font-black'>{tool.title}</h2>
              <p className='mt-2 text-sm leading-6 text-slate-500'>
                {tool.description}
              </p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  )
}
