'use client'

type NumberStepperProps = {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  ariaLabel: string
  className?: string
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export default function NumberStepper({
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  ariaLabel,
  className = '',
}: NumberStepperProps) {
  const updateValue = (nextValue: number) => {
    if (!Number.isFinite(nextValue)) return
    onChange(clamp(nextValue, min, max))
  }

  return (
    <div
      className={`ui-number-stepper ${className}`}
      role='group'
      aria-label={ariaLabel}>
      <button
        type='button'
        onClick={() => updateValue(value - step)}
        disabled={value <= min}
        aria-label={`${ariaLabel}减少`}>
        <span aria-hidden='true'>−</span>
      </button>
      <input
        type='number'
        inputMode='numeric'
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={event => updateValue(Number(event.target.value))}
        aria-label={ariaLabel}
      />
      <button
        type='button'
        onClick={() => updateValue(value + step)}
        disabled={value >= max}
        aria-label={`${ariaLabel}增加`}>
        <span aria-hidden='true'>+</span>
      </button>
    </div>
  )
}
