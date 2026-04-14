'use client'

type ToggleSwitchProps = {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  disabled?: boolean
}

export default function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: ToggleSwitchProps) {
  return (
    <span
      role='switch'
      aria-checked={checked}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={() => {
        if (disabled) return
        onChange(!checked)
      }}
      onKeyDown={event => {
        if (disabled) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onChange(!checked)
        }
      }}
      className={`inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
        checked
          ? 'bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-slate-100'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <span>{label}</span>
      <span
        className={`relative h-5 w-10 overflow-hidden rounded-full transition-colors ${
          checked ? 'bg-slate-900 dark:bg-slate-100' : 'bg-slate-300 dark:bg-slate-600'
        }`}>
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white dark:bg-slate-100 shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </span>
  )
}
