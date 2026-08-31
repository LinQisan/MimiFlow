'use client'

import {
  Children,
  isValidElement,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

type SelectChangeEvent = {
  target: { value: string }
  currentTarget: { value: string }
}

type CustomSelectProps = {
  children: ReactNode
  value?: string | number
  defaultValue?: string | number
  onChange?: (event: SelectChangeEvent) => void
  name?: string
  id?: string
  className?: string
  disabled?: boolean
  required?: boolean
  'aria-label'?: string
}

type SelectOption = {
  value: string
  label: ReactNode
  textLabel: string
  disabled: boolean
  group?: string
}

type MenuLayout = {
  left: number
  top: number
  width: number
  maxHeight: number
  openAbove: boolean
}

const textFromNode = (node: ReactNode): string => {
  if (
    typeof node === 'string' ||
    typeof node === 'number' ||
    typeof node === 'bigint'
  ) {
    return String(node)
  }
  if (Array.isArray(node)) return node.map(textFromNode).join('')
  if (isValidElement(node)) {
    return textFromNode(
      (node.props as { children?: ReactNode }).children,
    )
  }
  return ''
}

const readOptions = (children: ReactNode): SelectOption[] => {
  const options: SelectOption[] = []

  Children.forEach(children, child => {
    if (!isValidElement(child)) return
    const props = child.props as {
      children?: ReactNode
      value?: string | number
      disabled?: boolean
      label?: string
    }

    if (child.type === 'optgroup') {
      Children.forEach(props.children, nestedChild => {
        if (!isValidElement(nestedChild) || nestedChild.type !== 'option') return
        const nestedProps = nestedChild.props as {
          children?: ReactNode
          value?: string | number
          disabled?: boolean
        }
        options.push({
          value: String(nestedProps.value ?? ''),
          label: nestedProps.children,
          textLabel: textFromNode(nestedProps.children).trim(),
          disabled: Boolean(props.disabled || nestedProps.disabled),
          group: props.label,
        })
      })
      return
    }

    if (child.type !== 'option') return
    options.push({
      value: String(props.value ?? ''),
      label: props.children,
      textLabel: textFromNode(props.children).trim(),
      disabled: Boolean(props.disabled),
    })
  })

  return options
}

const findEnabledIndex = (
  options: SelectOption[],
  startIndex: number,
  direction: 1 | -1,
) => {
  if (options.length === 0) return -1
  let index = startIndex
  for (let offset = 0; offset < options.length; offset += 1) {
    index = (index + direction + options.length) % options.length
    if (!options[index]?.disabled) return index
  }
  return -1
}

export default function CustomSelect({
  children,
  value,
  defaultValue,
  onChange,
  name,
  id,
  className = '',
  disabled = false,
  required = false,
  'aria-label': ariaLabel,
}: CustomSelectProps) {
  const generatedId = useId()
  const triggerId = id || `custom-select-${generatedId}`
  const listboxId = `${triggerId}-listbox`
  const options = useMemo(() => readOptions(children), [children])
  const isControlled = value !== undefined
  const initialValue = String(
    defaultValue ?? options.find(option => !option.disabled)?.value ?? '',
  )
  const [internalValue, setInternalValue] = useState(initialValue)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [menuLayout, setMenuLayout] = useState<MenuLayout | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selectedValue = isControlled ? String(value ?? '') : internalValue
  const selectedIndex = options.findIndex(option => option.value === selectedValue)
  const selectedOption = options[selectedIndex] || options[0]

  const updateMenuLayout = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const viewportHeight = window.visualViewport?.height || window.innerHeight
    const viewportWidth = window.visualViewport?.width || window.innerWidth
    const desiredHeight = Math.min(288, options.length * 42 + 16)
    const spaceBelow = viewportHeight - rect.bottom - 8
    const spaceAbove = rect.top - 8
    const openAbove = spaceBelow < Math.min(desiredHeight, 180) && spaceAbove > spaceBelow
    const maxHeight = Math.max(
      112,
      Math.min(desiredHeight, openAbove ? spaceAbove : spaceBelow),
    )
    const width = Math.min(Math.max(rect.width, 160), viewportWidth - 24)
    const left = Math.min(Math.max(12, rect.left), viewportWidth - width - 12)
    const top = openAbove
      ? Math.max(8, rect.top - maxHeight - 4)
      : Math.min(viewportHeight - maxHeight - 8, rect.bottom + 4)

    setMenuLayout({ left, top, width, maxHeight, openAbove })
  }, [options.length])

  const openMenu = () => {
    if (disabled) return
    const nextActiveIndex =
      selectedIndex >= 0 && !options[selectedIndex]?.disabled
        ? selectedIndex
        : findEnabledIndex(options, -1, 1)
    setActiveIndex(nextActiveIndex)
    setIsOpen(true)
  }

  const closeMenu = () => {
    setIsOpen(false)
    setMenuLayout(null)
  }

  const selectOption = (option: SelectOption) => {
    if (option.disabled) return
    if (!isControlled) setInternalValue(option.value)
    onChange?.({
      target: { value: option.value },
      currentTarget: { value: option.value },
    })
    closeMenu()
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault()
      closeMenu()
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!isOpen) {
        openMenu()
        return
      }
      setActiveIndex(current =>
        findEnabledIndex(options, current, event.key === 'ArrowDown' ? 1 : -1),
      )
      return
    }

    if ((event.key === 'Enter' || event.key === ' ') && isOpen) {
      event.preventDefault()
      const activeOption = options[activeIndex]
      if (activeOption) selectOption(activeOption)
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openMenu()
      return
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      if (!isOpen) openMenu()
      const startIndex = event.key === 'Home' ? -1 : 0
      setActiveIndex(
        findEnabledIndex(options, startIndex, event.key === 'Home' ? 1 : -1),
      )
    }
  }

  useEffect(() => {
    if (!isOpen) return
    updateMenuLayout()

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        closeMenu()
      }
    }
    const handleViewportChange = () => closeMenu()
    const handleScroll = (event: Event) => {
      const target = event.target
      if (target instanceof Node && menuRef.current?.contains(target)) return
      closeMenu()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleScroll, true)
    window.visualViewport?.addEventListener('resize', handleViewportChange)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleScroll, true)
      window.visualViewport?.removeEventListener('resize', handleViewportChange)
    }
  }, [isOpen, updateMenuLayout])

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return
    const activeElement = document.getElementById(`${listboxId}-${activeIndex}`)
    activeElement?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, isOpen, listboxId])

  return (
    <>
      <button
        ref={triggerRef}
        id={triggerId}
        type='button'
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup='listbox'
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={
          isOpen && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined
        }
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        onKeyDown={handleKeyDown}
        className={`relative flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-55 ${className}`}>
        <span className='min-w-0 flex-1 truncate'>
          {selectedOption?.label || selectedValue}
        </span>
        <svg
          aria-hidden='true'
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill='none'
          viewBox='0 0 24 24'
          stroke='currentColor'
          strokeWidth='2'>
          <path strokeLinecap='round' strokeLinejoin='round' d='m7 10 5 5 5-5' />
        </svg>
      </button>

      {name ? <input type='hidden' name={name} value={selectedValue} /> : null}
      {required && !selectedValue ? (
        <input
          tabIndex={-1}
          aria-hidden='true'
          required
          value=''
          onChange={() => {}}
          className='pointer-events-none absolute h-px w-px opacity-0'
        />
      ) : null}

      {isOpen && menuLayout
        ? createPortal(
            <div
              ref={menuRef}
              id={listboxId}
              role='listbox'
              aria-label={ariaLabel}
              className='ui-pop ui-pop-surface fixed z-[100] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_45px_-18px_rgba(15,23,42,0.45)] dark:border-slate-700 dark:bg-slate-900'
              style={{
                left: menuLayout.left,
                top: menuLayout.top,
                width: menuLayout.width,
                maxHeight: menuLayout.maxHeight,
              }}>
              {options.map((option, index) => {
                const isSelected = option.value === selectedValue
                const isActive = index === activeIndex
                const previousGroup = index > 0 ? options[index - 1]?.group : undefined
                const showGroup = option.group && option.group !== previousGroup
                return (
                  <div key={`${option.value}-${index}`}>
                    {showGroup ? (
                      <div className='px-3 pb-1 pt-2 text-[11px] font-semibold text-slate-400'>
                        {option.group}
                      </div>
                    ) : null}
                    <button
                      id={`${listboxId}-${index}`}
                      type='button'
                      role='option'
                      aria-selected={isSelected}
                      disabled={option.disabled}
                      onPointerMove={() => setActiveIndex(index)}
                      onClick={() => selectOption(option)}
                      className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        isActive
                          ? 'bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white'
                          : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/70'
                      }`}>
                      <span className='inline-flex h-4 w-4 shrink-0 items-center justify-center'>
                        {isSelected ? (
                          <svg
                            aria-hidden='true'
                            className='h-4 w-4'
                            fill='none'
                            viewBox='0 0 24 24'
                            stroke='currentColor'
                            strokeWidth='2.5'>
                            <path
                              strokeLinecap='round'
                              strokeLinejoin='round'
                              d='m5 12 4 4L19 6'
                            />
                          </svg>
                        ) : null}
                      </span>
                      <span className='min-w-0 flex-1 break-words'>
                        {option.label}
                      </span>
                    </button>
                  </div>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
