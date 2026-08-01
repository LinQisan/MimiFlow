import type { ReactNode } from 'react'

export default function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: string
  description?: string
  actions?: ReactNode
  meta?: ReactNode
}) {
  return (
    <header className='border-b border-slate-200 pb-5'>
      <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
        <div className='min-w-0'>
          <h1 className='text-3xl font-black tracking-tight text-slate-950'>{title}</h1>
          {description ? (
            <p className='mt-2 max-w-2xl text-sm leading-6 text-slate-600'>{description}</p>
          ) : null}
        </div>
        {actions ? <div className='flex shrink-0 flex-wrap gap-2'>{actions}</div> : null}
      </div>
      {meta ? <div className='mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500'>{meta}</div> : null}
    </header>
  )
}
