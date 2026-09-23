import Link from 'next/link'

const tools = [
  { href: '/manage/system/invites', title: '注册邀请码', description: '创建、查看和撤销一次性邀请码。' },
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
        <section className='grid sm:grid-cols-2 gap-6'>
          {tools.map(tool => (
            <Link
              key={tool.href}
              href={tool.href}
              className='px-1 py-4 transition hover:bg-white'>
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
