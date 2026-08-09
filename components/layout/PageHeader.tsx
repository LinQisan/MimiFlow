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
    <header className='editorial-page-header border-b border-slate-200 pb-7 md:pb-9'>
      <div className='flex flex-col gap-5 md:flex-row md:items-end md:justify-between'>
        <div className='min-w-0'>
          <p className='editorial-kicker'>MIMIFLOW / STUDY</p>
          <h1 className='mt-3 text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl'>{title}</h1>
          {description ? (
            <p className='mt-4 max-w-2xl text-sm leading-7 text-slate-600 md:text-base'>{description}</p>
          ) : null}
        </div>
        {actions ? <div className='flex shrink-0 flex-wrap gap-2'>{actions}</div> : null}
      </div>
      {meta ? <div className='mt-6 flex flex-wrap gap-x-7 gap-y-2 text-xs tracking-wide text-slate-500'>{meta}</div> : null}
    </header>
  )
}
