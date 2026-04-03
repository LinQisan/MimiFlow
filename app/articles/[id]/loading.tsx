export default function ArticleDetailLoading() {
  return (
    <div className='theme-page-article min-h-screen bg-gray-50 dark:bg-slate-950 md:flex md:flex-row'>
      <div className='flex-1 border-r border-gray-200 bg-gray-50 px-4 pb-8 pt-6 dark:border-slate-700 dark:bg-slate-950 md:h-screen md:overflow-y-hidden md:px-6 md:pt-8'>
        <div className='mx-auto max-w-4xl space-y-4'>
          <div className='h-8 w-52 animate-pulse bg-gray-100 dark:bg-slate-800' />
          <div className='h-5 w-36 animate-pulse bg-gray-100 dark:bg-slate-800' />
          <div className='h-px w-full bg-gray-200 dark:bg-slate-700' />
          {Array.from({ length: 10 }).map((_, idx) => (
            <div
              key={`article-loading-line-${idx}`}
              className='h-6 w-full animate-pulse bg-gray-100 dark:bg-slate-800'
            />
          ))}
        </div>
      </div>
      <div className='min-h-[62vh] border-t border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-900 md:h-screen md:w-[30rem] md:border-l md:border-t-0 md:p-6'>
        <div className='space-y-4'>
          <div className='h-10 w-32 animate-pulse bg-gray-100 dark:bg-slate-800' />
          <div className='h-px w-full bg-gray-200 dark:bg-slate-700' />
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={`article-quiz-loading-opt-${idx}`}
              className='h-14 w-full animate-pulse bg-gray-100 dark:bg-slate-800'
            />
          ))}
          <div className='grid grid-cols-2 gap-3 pt-2'>
            <div className='h-11 animate-pulse bg-gray-100 dark:bg-slate-800' />
            <div className='h-11 animate-pulse bg-gray-100 dark:bg-slate-800' />
          </div>
        </div>
      </div>
    </div>
  )
}
