'use client'

import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

type DatePickerProps = {
  value: string
  onChange: (value: string) => void
  id?: string
  'aria-label'?: string
  disabled?: boolean
  required?: boolean
  allowClear?: boolean
  className?: string
}

type PopoverLayout = {
  left: number
  top: number
  width: number
  maxHeight: number
}

const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']
const DATE_VALUE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const MANUAL_DATE_PATTERN =
  /^(\d{4})\s*(?:[-/.年])\s*(\d{1,2})\s*(?:[-/.月])\s*(\d{1,2})\s*日?$/

const atNoon = (year: number, month: number, day: number) =>
  new Date(year, month, day, 12)

const parseDateValue = (value: string) => {
  const trimmedValue = value.trim()
  const match =
    DATE_VALUE_PATTERN.exec(trimmedValue) ||
    MANUAL_DATE_PATTERN.exec(trimmedValue) ||
    /^(\d{4})(\d{2})(\d{2})$/.exec(trimmedValue)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = atNoon(year, month - 1, day)
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null
}

const toDateValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const addDays = (date: Date, amount: number) =>
  atNoon(date.getFullYear(), date.getMonth(), date.getDate() + amount)

const addMonths = (date: Date, amount: number) =>
  atNoon(date.getFullYear(), date.getMonth() + amount, 1)

const monthStart = (date: Date) =>
  atNoon(date.getFullYear(), date.getMonth(), 1)

const sameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate()

const formatTriggerValue = (value: string) => {
  const date = parseDateValue(value)
  if (!date) return ''
  return `${date.getFullYear()} / ${String(date.getMonth() + 1).padStart(2, '0')} / ${String(date.getDate()).padStart(2, '0')}`
}

export default function DatePicker({
  value,
  onChange,
  id,
  'aria-label': ariaLabel = '选择日期',
  disabled = false,
  required = false,
  allowClear = true,
  className = '',
}: DatePickerProps) {
  const generatedId = useId()
  const triggerId = id || `date-picker-${generatedId}`
  const dialogId = `${triggerId}-dialog`
  const today = useMemo(() => {
    const current = new Date()
    return atNoon(current.getFullYear(), current.getMonth(), current.getDate())
  }, [])
  const selectedDate = useMemo(() => parseDateValue(value), [value])
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }),
    [],
  )
  const fullDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
      }),
    [],
  )
  const [isOpen, setIsOpen] = useState(false)
  const [draftValue, setDraftValue] = useState(() => formatTriggerValue(value))
  const [isDraftInvalid, setIsDraftInvalid] = useState(false)
  const [viewMonth, setViewMonth] = useState(() =>
    monthStart(selectedDate || today),
  )
  const [focusedDate, setFocusedDate] = useState(() => selectedDate || today)
  const [layout, setLayout] = useState<PopoverLayout | null>(null)
  const fieldRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const monthLabel = monthFormatter.format(viewMonth)

  const calendarDays = useMemo(() => {
    const first = monthStart(viewMonth)
    const mondayOffset = (first.getDay() + 6) % 7
    const firstVisibleDay = addDays(first, -mondayOffset)
    return Array.from({ length: 42 }, (_, index) =>
      addDays(firstVisibleDay, index),
    )
  }, [viewMonth])

  const updateLayout = useCallback(() => {
    const field = fieldRef.current
    if (!field) return
    const rect = field.getBoundingClientRect()
    const viewportWidth = window.visualViewport?.width || window.innerWidth
    const viewportHeight = window.visualViewport?.height || window.innerHeight
    const width = Math.min(320, viewportWidth - 24)
    const height = 430
    const left = Math.min(
      Math.max(12, rect.left),
      Math.max(12, viewportWidth - width - 12),
    )
    const spaceBelow = viewportHeight - rect.bottom - 8
    const spaceAbove = rect.top - 8
    const openAbove = spaceBelow < Math.min(height, 320) && spaceAbove > spaceBelow
    const maxHeight = Math.max(
      180,
      Math.min(height, openAbove ? spaceAbove : spaceBelow),
    )
    const top = openAbove
      ? Math.max(8, rect.top - maxHeight - 6)
      : rect.bottom + 6
    setLayout({ left, top, width, maxHeight })
  }, [])

  const openPicker = () => {
    if (disabled) return
    const initialDate = selectedDate || today
    setViewMonth(monthStart(initialDate))
    setFocusedDate(initialDate)
    setIsOpen(true)
  }

  const closePicker = useCallback((restoreFocus = false) => {
    setIsOpen(false)
    setLayout(null)
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus())
    }
  }, [])

  const selectDate = (date: Date) => {
    const nextValue = toDateValue(date)
    setDraftValue(formatTriggerValue(nextValue))
    setIsDraftInvalid(false)
    onChange(nextValue)
    closePicker(true)
  }

  const commitDraft = () => {
    const trimmedValue = draftValue.trim()
    if (!trimmedValue) {
      setDraftValue('')
      setIsDraftInvalid(false)
      onChange('')
      return true
    }
    const parsedDate = parseDateValue(trimmedValue)
    if (!parsedDate) {
      setIsDraftInvalid(true)
      return false
    }
    const nextValue = toDateValue(parsedDate)
    setDraftValue(formatTriggerValue(nextValue))
    setIsDraftInvalid(false)
    onChange(nextValue)
    return true
  }

  const moveFocus = (date: Date) => {
    setFocusedDate(date)
    setViewMonth(monthStart(date))
  }

  const handleDayKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    date: Date,
  ) => {
    const movements: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    }
    if (event.key in movements) {
      event.preventDefault()
      moveFocus(addDays(date, movements[event.key]))
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const weekday = (date.getDay() + 6) % 7
      moveFocus(addDays(date, event.key === 'Home' ? -weekday : 6 - weekday))
      return
    }
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      const targetMonth = addMonths(date, event.key === 'PageUp' ? -1 : 1)
      const lastDay = new Date(
        targetMonth.getFullYear(),
        targetMonth.getMonth() + 1,
        0,
      ).getDate()
      moveFocus(
        atNoon(
          targetMonth.getFullYear(),
          targetMonth.getMonth(),
          Math.min(date.getDate(), lastDay),
        ),
      )
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closePicker(true)
    }
  }

  useEffect(() => {
    if (!isOpen) return
    updateLayout()

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !fieldRef.current?.contains(target) &&
        !dialogRef.current?.contains(target)
      ) {
        closePicker()
      }
    }
    const handleViewportChange = () => closePicker()

    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    window.visualViewport?.addEventListener('resize', handleViewportChange)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
      window.visualViewport?.removeEventListener('resize', handleViewportChange)
    }
  }, [closePicker, isOpen, updateLayout])

  useEffect(() => {
    if (!isOpen || !layout) return
    const focusedButton = dialogRef.current?.querySelector<HTMLButtonElement>(
      `[data-date="${toDateValue(focusedDate)}"]`,
    )
    focusedButton?.focus()
  }, [focusedDate, isOpen, layout, viewMonth])

  useEffect(() => {
    if (document.activeElement?.id === `${triggerId}-input`) return
    setDraftValue(formatTriggerValue(value))
    setIsDraftInvalid(false)
  }, [triggerId, value])

  return (
    <>
      <div
        ref={fieldRef}
        className={`flex h-11 w-full items-center rounded-xl border bg-white transition-colors focus-within:ring-2 dark:bg-slate-900 ${
          isDraftInvalid
            ? 'border-rose-400 focus-within:border-rose-500 focus-within:ring-rose-100'
            : 'border-slate-200 hover:border-slate-300 focus-within:border-slate-500 focus-within:ring-slate-200 dark:border-slate-700'
        } ${disabled ? 'cursor-not-allowed opacity-50' : ''} ${className}`}>
        <input
          id={`${triggerId}-input`}
          type='text'
          inputMode='numeric'
          autoComplete='off'
          disabled={disabled}
          required={required}
          value={draftValue}
          aria-label={ariaLabel}
          aria-invalid={isDraftInvalid}
          aria-describedby={isDraftInvalid ? `${triggerId}-error` : undefined}
          placeholder='年 / 月 / 日'
          onChange={event => {
            setDraftValue(event.target.value)
            setIsDraftInvalid(false)
          }}
          onBlur={() => commitDraft()}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (commitDraft()) event.currentTarget.blur()
            }
            if (event.key === 'ArrowDown' && !isOpen) {
              event.preventDefault()
              openPicker()
            }
            if (event.key === 'Escape' && isOpen) {
              event.preventDefault()
              closePicker()
            }
          }}
          className='ui-date-picker-input min-w-0 flex-1 border-0 bg-transparent px-3 text-sm font-semibold tabular-nums text-slate-900 outline-none placeholder:font-medium placeholder:text-slate-400 dark:text-slate-100'
        />
        <button
          ref={triggerRef}
          id={triggerId}
          type='button'
          disabled={disabled}
          aria-label={`${ariaLabel}日历`}
          aria-haspopup='dialog'
          aria-expanded={isOpen}
          aria-controls={isOpen ? dialogId : undefined}
          onClick={() => (isOpen ? closePicker() : openPicker())}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' && !isOpen) {
              event.preventDefault()
              openPicker()
            }
            if (event.key === 'Escape' && isOpen) {
              event.preventDefault()
              closePicker()
            }
          }}
          className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-300 disabled:cursor-not-allowed dark:hover:bg-slate-800 dark:hover:text-slate-200'>
          <svg
            aria-hidden='true'
            viewBox='0 0 24 24'
            className='h-4 w-4'
            fill='none'
            stroke='currentColor'
            strokeWidth='1.8'>
            <path d='M7 3v3M17 3v3M4.5 9h15M5.5 5h13a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z' />
          </svg>
        </button>
      </div>
      {isDraftInvalid ? (
        <p id={`${triggerId}-error`} className='mt-1 text-[11px] font-medium text-rose-600'>
          请输入有效日期，例如 2026-08-30
        </p>
      ) : null}

      {isOpen && layout
        ? createPortal(
            <div
              ref={dialogRef}
              id={dialogId}
              role='dialog'
              aria-label={ariaLabel}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  closePicker(true)
                }
              }}
              className='ui-pop ui-pop-surface fixed z-[110] overflow-y-auto p-4 text-slate-800 dark:text-slate-100'
              style={{
                left: layout.left,
                top: layout.top,
                width: layout.width,
                maxHeight: layout.maxHeight,
              }}>
              <div className='mb-3 flex items-center justify-between gap-3'>
                <p className='text-sm font-semibold tabular-nums'>{monthLabel}</p>
                <div className='flex items-center gap-1'>
                  <button
                    type='button'
                    aria-label='上个月'
                    onClick={() => {
                      const previousMonth = addMonths(viewMonth, -1)
                      setViewMonth(previousMonth)
                      setFocusedDate(previousMonth)
                    }}
                    className='ui-btn inline-flex h-9 w-9 items-center justify-center p-0 text-lg text-slate-500'>
                    ←
                  </button>
                  <button
                    type='button'
                    aria-label='下个月'
                    onClick={() => {
                      const nextMonth = addMonths(viewMonth, 1)
                      setViewMonth(nextMonth)
                      setFocusedDate(nextMonth)
                    }}
                    className='ui-btn inline-flex h-9 w-9 items-center justify-center p-0 text-lg text-slate-500'>
                    →
                  </button>
                </div>
              </div>

              <div role='grid' aria-label={monthLabel}>
                <div role='row' className='mb-1 grid grid-cols-7'>
                  {DAY_LABELS.map(label => (
                    <span
                      key={label}
                      role='columnheader'
                      className='flex h-8 items-center justify-center text-[11px] font-semibold text-slate-400'>
                      {label}
                    </span>
                  ))}
                </div>
                <div className='grid grid-cols-7 gap-y-1'>
                  {calendarDays.map(date => {
                    const dateValue = toDateValue(date)
                    const isSelected = Boolean(
                      selectedDate && sameDay(date, selectedDate),
                    )
                    const isToday = sameDay(date, today)
                    const isCurrentMonth = date.getMonth() === viewMonth.getMonth()
                    const isFocused = sameDay(date, focusedDate)
                    return (
                      <button
                        key={dateValue}
                        type='button'
                        role='gridcell'
                        data-date={dateValue}
                        tabIndex={isFocused ? 0 : -1}
                        aria-label={fullDateFormatter.format(date)}
                        aria-selected={isSelected}
                        aria-current={isToday ? 'date' : undefined}
                        onFocus={() => setFocusedDate(date)}
                        onKeyDown={event => handleDayKeyDown(event, date)}
                        onClick={() => selectDate(date)}
                        className={`mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
                          isSelected
                            ? 'bg-slate-900 font-semibold text-white dark:bg-slate-100 dark:text-slate-950'
                            : isToday
                              ? 'border border-slate-400 font-semibold text-slate-900 dark:text-slate-100'
                              : isCurrentMonth
                                ? 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                                : 'text-slate-300 hover:bg-slate-50 dark:text-slate-600 dark:hover:bg-slate-800/60'
                        }`}>
                        {date.getDate()}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className='mt-3 flex items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-700'>
                {allowClear ? (
                  <button
                    type='button'
                    onClick={() => {
                      setDraftValue('')
                      setIsDraftInvalid(false)
                      onChange('')
                      closePicker(true)
                    }}
                    className='ui-btn h-9 px-3 text-xs text-slate-500'>
                    清除
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type='button'
                  onClick={() => selectDate(today)}
                  className='ui-btn h-9 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200'>
                  今天
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
