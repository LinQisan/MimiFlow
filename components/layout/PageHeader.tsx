import type { ReactNode } from 'react'

export default function PageHeader({
  title,
  description,
  actions,
  meta,
  showTitle = false,
}: {
  title: string
  description?: string
  actions?: ReactNode
  meta?: ReactNode
  showTitle?: boolean
}) {
  if (!showTitle) {
    if (!actions && !meta) return null
    return (
      <header className='editorial-page-header flex flex-col gap-4 border-b border-slate-200 py-4 sm:flex-row sm:items-center sm:justify-between'>
        {meta ? (
          <div className='flex flex-wrap gap-x-7 gap-y-2 text-xs tracking-wide text-slate-500'>
            {meta}
          </div>
        ) : <span />}
        {actions ? <div className='flex shrink-0 flex-wrap gap-2'>{actions}</div> : null}
      </header>
    )
  }

  return (
    <header className='editorial-page-header border-b border-slate-200 pb-5 md:pb-6'>
      <div className='flex flex-col gap-5 md:flex-row md:items-end md:justify-between'>
        <div className='min-w-0'>
          <h1 className='text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl'>{title}</h1>
          {description ? (
            <p className='mt-3 max-w-2xl text-sm leading-6 text-slate-500'>{description}</p>
          ) : null}
        </div>
        {actions ? <div className='flex shrink-0 flex-wrap gap-2'>{actions}</div> : null}
      </div>
      {meta ? <div className='mt-6 flex flex-wrap gap-x-7 gap-y-2 text-xs tracking-wide text-slate-500'>{meta}</div> : null}
    </header>
  )
}
