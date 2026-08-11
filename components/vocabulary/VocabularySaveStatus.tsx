export type TooltipSaveState =
  | 'idle'
  | 'saving'
  | 'success'
  | 'already_exists'
  | 'error'

export const SAVE_BG_COLORS: Record<TooltipSaveState, string> = {
  idle: 'bg-slate-900 text-white hover:bg-slate-800',
  saving: 'bg-slate-100 text-slate-500 cursor-not-allowed',
  success: 'bg-slate-100 text-slate-700',
  already_exists: 'bg-slate-100 text-slate-700',
  error: 'bg-rose-100 text-rose-700',
}

export function SaveStatusIcon({
  state,
  className = 'h-4 w-4',
}: {
  state: TooltipSaveState
  className?: string
}) {
  if (state === 'saving') {
    return (
      <svg className={`animate-spin text-current ${className}`} fill='none' viewBox='0 0 24 24'>
        <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='3' />
        <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z' />
      </svg>
    )
  }

  const path =
    state === 'success'
      ? 'M5 13l4 4L19 7'
      : state === 'already_exists'
        ? 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'
        : state === 'error'
          ? 'M6 18L18 6M6 6l12 12'
          : 'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z'

  return (
    <svg className={className} fill='none' stroke='currentColor' viewBox='0 0 24 24'>
      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d={path} />
    </svg>
  )
}
