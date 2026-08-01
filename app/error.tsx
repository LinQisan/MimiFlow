'use client'

import Link from 'next/link'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className='flex min-h-screen items-center justify-center bg-slate-50 px-4'>
      <section className='w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm'>
        <p className='text-xs font-bold uppercase tracking-[0.22em] text-rose-500'>
          页面暂时不可用
        </p>
        <h1 className='mt-3 text-2xl font-black text-slate-950'>内容加载失败</h1>
        <p className='mt-2 text-sm leading-6 text-slate-600'>
          已保存的数据不会受影响。可以重试，或返回首页继续使用其他功能。
        </p>
        <div className='mt-5 flex flex-wrap justify-center gap-2'>
          <button type='button' onClick={reset} className='ui-btn ui-btn-primary'>
            重新加载
          </button>
          <Link href='/' className='ui-btn'>
            返回首页
          </Link>
        </div>
      </section>
    </main>
  )
}
