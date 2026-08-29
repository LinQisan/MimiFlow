export default function PracticeSessionLoading() {
  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 text-slate-900 md:px-6'>
      <div className='mx-auto max-w-5xl animate-pulse'>
        <div className='flex items-center justify-between border-b border-slate-200 pb-4'>
          <div className='h-5 w-44 rounded bg-slate-200' />
          <div className='h-9 w-24 rounded bg-slate-200' />
        </div>
        <div className='mt-6 flex gap-2'>
          <div className='h-8 w-20 rounded bg-slate-200' />
          <div className='h-8 w-20 rounded bg-slate-200' />
          <div className='h-8 w-20 rounded bg-slate-200' />
        </div>
        <section className='mt-6 border-y border-slate-200 bg-white px-4 py-8'>
          <div className='h-5 w-3/4 rounded bg-slate-200' />
          <div className='mt-8 space-y-3'>
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className='h-12 rounded bg-slate-100' />
            ))}
          </div>
        </section>
        <p className='mt-4 text-sm font-medium text-slate-400'>正在准备答题…</p>
      </div>
    </main>
  )
}
