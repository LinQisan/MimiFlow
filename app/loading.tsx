export default function GlobalLoading() {
  return (
    <main
      className='flex min-h-[60vh] items-center justify-center px-4'
      aria-live='polite'
      aria-busy='true'>
      <p className='text-sm font-semibold text-slate-500'>正在加载内容…</p>
    </main>
  )
}
