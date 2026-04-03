export default function QuizzesLoading() {
  return (
    <div className='min-h-screen bg-gray-50 px-4 pb-20 pt-4 md:px-8 md:pt-8'>
      <div className='mx-auto max-w-7xl'>
        <section className='mb-8 border-b border-gray-200 pb-4 md:pb-5'>
          <div className='h-10 w-40 animate-pulse bg-gray-100 md:h-12 md:w-52' />
          <div className='mt-2 h-5 w-80 max-w-full animate-pulse bg-gray-100' />
        </section>
        <section className='mb-4 flex items-center justify-between border-b border-gray-200 pb-3'>
          <div className='h-4 w-36 animate-pulse bg-gray-100' />
          <div className='flex items-center gap-2'>
            <div className='h-9 w-20 animate-pulse bg-gray-100' />
            <div className='h-9 w-20 animate-pulse bg-gray-100' />
          </div>
        </section>
        <div className='min-h-[62vh] space-y-6'>
          {Array.from({ length: 3 }).map((_, groupIdx) => (
            <section
              key={`quizzes-loading-group-${groupIdx}`}
              className='border-b border-gray-200 pb-4 md:pb-6'>
              <div className='mb-5 flex items-center justify-between'>
                <div className='h-6 w-56 animate-pulse bg-gray-100' />
                <div className='h-6 w-14 animate-pulse bg-gray-100' />
              </div>
              <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
                {Array.from({ length: 2 }).map((__, idx) => (
                  <div
                    key={`quizzes-loading-card-${groupIdx}-${idx}`}
                    className='border-b border-gray-200 px-1 py-4'>
                    <div className='h-6 w-3/4 animate-pulse bg-gray-100' />
                    <div className='mt-2 h-4 w-full animate-pulse bg-gray-100' />
                    <div className='mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3'>
                      <div className='h-9 animate-pulse bg-gray-100' />
                      <div className='h-9 animate-pulse bg-gray-100' />
                      <div className='h-9 animate-pulse bg-gray-100' />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
