export default function PracticePaperLoading() {
  return (
    <main className='min-h-screen bg-stone-50 px-4 py-8 text-slate-900 md:px-6'>
      <div className='mx-auto max-w-5xl animate-pulse'>
        <div className='h-4 w-20 rounded bg-slate-200' />
        <div className='mt-6 h-9 w-72 max-w-full rounded-lg bg-slate-200' />
        <div className='mt-3 h-4 w-32 rounded bg-slate-200' />
        <div className='mt-10 space-y-4 border-y border-slate-200 py-6'>
          <div className='h-5 w-40 rounded bg-slate-200' />
          <div className='h-14 rounded-xl bg-white' />
          <div className='h-14 rounded-xl bg-white' />
        </div>
        <p className='mt-5 text-sm font-medium text-slate-400'>正在打开试卷详情…</p>
      </div>
    </main>
  )
}
