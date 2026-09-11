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
    <main className='min-h-screen bg-[#f6f5f1] px-4 py-6 md:px-6 md:py-8'>
      <div className='mx-auto max-w-5xl'>
        <section className='grid border-y border-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-slate-200'>
          {tools.map(tool => (
            <Link
              key={tool.href}
              href={tool.href}
              className='border-b border-slate-200 px-1 py-4 transition hover:bg-white sm:border-b-0 last:border-b-0'>
              <h2 className='text-sm font-bold'>{tool.title}</h2>
              <p className='mt-1 text-xs leading-5 text-slate-500'>
                {tool.description}
              </p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  )
}
