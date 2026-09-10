import Link from 'next/link'

export default function NotFoundPage() {
  return (
    <main className='flex min-h-screen items-center justify-center bg-slate-50 px-4'>
      <section className='w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 text-center'>
        <p className='text-xs font-bold uppercase tracking-[0.22em] text-slate-400'>
          404
        </p>
        <h1 className='mt-3 text-2xl font-bold text-slate-950'>没有找到这个页面</h1>
        <p className='mt-2 text-sm text-slate-600'>
          地址可能已经调整，请从新的学习或管理入口继续。
        </p>
        <div className='mt-5 flex flex-wrap justify-center gap-2'>
          <Link href='/' className='ui-btn ui-btn-primary'>
            学习首页
          </Link>
          <Link href='/manage' className='ui-btn'>
            内容管理
          </Link>
        </div>
      </section>
    </main>
  )
}
