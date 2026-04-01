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
    <button
      type='button'
      role='switch'
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
        checked ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <span>{label}</span>
      <span
        className={`relative h-5 w-10 overflow-hidden rounded-full transition-colors ${
          checked ? 'bg-indigo-500' : 'bg-gray-300'
        }`}>
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  )
}
