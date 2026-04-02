'use client'

import { useEffect, useRef, useState } from 'react'

type InlineConfirmActionProps = {
  message: string
  onConfirm: () => Promise<void> | void
  triggerLabel: string
  pendingLabel?: string
  confirmLabel?: string
  cancelLabel?: string
  triggerClassName?: string
  danger?: boolean
}

export default function InlineConfirmAction({
  message,
  onConfirm,
  triggerLabel,
  pendingLabel = '处理中...',
  confirmLabel = '确认',
  cancelLabel = '取消',
  triggerClassName = '',
  danger = true,
}: InlineConfirmActionProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleOutside)
    }
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  const handleConfirm = async () => {
    setPending(true)
    setOpen(false)
    try {
      await onConfirm()
    } finally {
      setPending(false)
    }
  }

  return (
    <div ref={wrapRef} className='relative inline-block'>
      <button
        type='button'
        disabled={pending}
        onClick={event => {
          event.stopPropagation()
          setOpen(prev => !prev)
        }}
        className={triggerClassName}>
        {pending ? pendingLabel : triggerLabel}
      </button>

      {open && !pending && (
        <div
          onClick={event => event.stopPropagation()}
          className='ui-pop absolute right-0 bottom-full mb-2 w-56 border border-gray-200 bg-white p-3 z-60 animate-in fade-in zoom-in-95 duration-150'>
          <p className='text-xs leading-relaxed text-gray-600 mb-2.5'>{message}</p>
          <div className='flex items-center justify-end gap-2'>
            <button
              type='button'
              onClick={event => {
                event.stopPropagation()
                setOpen(false)
              }}
              className='ui-btn ui-btn-sm'>
              {cancelLabel}
            </button>
            <button
              type='button'
              onClick={event => {
                event.stopPropagation()
                void handleConfirm()
              }}
              className={`ui-btn ui-btn-sm text-white ${
                danger
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}>
              {confirmLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
