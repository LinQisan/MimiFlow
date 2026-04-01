'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

type DialogKind = 'confirm' | 'prompt'
type ToastTone = 'info' | 'success' | 'error'

type DialogRequest = {
  kind: DialogKind
  title: string
  message: string
  defaultValue?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  resolve: (value: boolean | string | null) => void
}

type ToastItem = {
  id: number
  message: string
  tone: ToastTone
}

type DialogContextType = {
  alert: (
    message: string,
    options?: { title?: string; confirmText?: string; danger?: boolean },
  ) => Promise<void>
  toast: (message: string, options?: { tone?: ToastTone }) => void
  confirm: (
    message: string,
    options?: {
      title?: string
      confirmText?: string
      cancelText?: string
      danger?: boolean
    },
  ) => Promise<boolean>
  prompt: (
    message: string,
    options?: {
      title?: string
      defaultValue?: string
      confirmText?: string
      cancelText?: string
      danger?: boolean
    },
  ) => Promise<string | null>
}

const DialogContext = createContext<DialogContextType | null>(null)

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<DialogRequest[]>([])
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [promptValue, setPromptValue] = useState('')
  const [toastSeed, setToastSeed] = useState(1)

  const current = queue[0] || null

  const push = useCallback((request: DialogRequest) => {
    setQueue(prev => [...prev, request])
  }, [])

  const closeCurrent = useCallback(() => {
    setQueue(prev => prev.slice(1))
    setPromptValue('')
  }, [])

  const pushToast = useCallback((message: string, tone: ToastTone = 'info') => {
    setToastSeed(prev => {
      const id = prev
      setToasts(items => [...items, { id, message, tone }])
      return prev + 1
    })
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts(items => items.filter(item => item.id !== id))
  }, [])

  useEffect(() => {
    if (toasts.length === 0) return
    const timers = toasts.map(item =>
      window.setTimeout(() => removeToast(item.id), 2600),
    )
    return () => timers.forEach(timer => window.clearTimeout(timer))
  }, [toasts, removeToast])

  const api = useMemo<DialogContextType>(
    () => ({
      alert: (message, options) =>
        new Promise<void>(resolve => {
          pushToast(message, options?.danger ? 'error' : 'info')
          resolve()
        }),
      toast: (message, options) => {
        pushToast(message, options?.tone || 'info')
      },
      confirm: (message, options) =>
        new Promise<boolean>(resolve => {
          push({
            kind: 'confirm',
            title: options?.title || '请确认',
            message,
            confirmText: options?.confirmText || '确认',
            cancelText: options?.cancelText || '取消',
            danger: options?.danger || false,
            resolve: value => resolve(Boolean(value)),
          })
        }),
      prompt: (message, options) =>
        new Promise<string | null>(resolve => {
          push({
            kind: 'prompt',
            title: options?.title || '请输入',
            message,
            defaultValue: options?.defaultValue || '',
            confirmText: options?.confirmText || '确定',
            cancelText: options?.cancelText || '取消',
            danger: options?.danger || false,
            resolve: value => resolve(typeof value === 'string' ? value : null),
          })
        }),
    }),
    [push, pushToast],
  )

  useEffect(() => {
    if (current?.kind === 'prompt') {
      setPromptValue(current.defaultValue || '')
    }
  }, [current])

  const handleCancel = () => {
    if (!current) return
    current.resolve(null)
    closeCurrent()
  }

  const handleConfirm = () => {
    if (!current) return
    if (current.kind === 'confirm') {
      current.resolve(true)
    } else {
      current.resolve(promptValue.trim() ? promptValue : '')
    }
    closeCurrent()
  }

  return (
    <DialogContext.Provider value={api}>
      {children}
      <div className='fixed top-4 right-4 z-1000 flex w-[min(90vw,22rem)] flex-col gap-2 pointer-events-none'>
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-xl border px-3 py-2 text-sm font-medium shadow-lg backdrop-blur-sm ${
              toast.tone === 'success'
                ? 'border-emerald-200 bg-emerald-50/95 text-emerald-700'
                : toast.tone === 'error'
                  ? 'border-rose-200 bg-rose-50/95 text-rose-700'
                  : 'border-gray-200 bg-white/95 text-gray-700'
            }`}>
            {toast.message}
          </div>
        ))}
      </div>
      {current && (
        <div className='fixed top-4 right-4 z-1000 w-[min(92vw,24rem)]'>
          <div className='rounded-2xl border border-gray-200 bg-white shadow-xl p-4'>
            <h3 className='text-base font-bold text-gray-900 mb-1.5'>
              {current.title}
            </h3>
            <p className='text-sm text-gray-600 leading-relaxed whitespace-pre-wrap mb-3'>
              {current.message}
            </p>

            {current.kind === 'prompt' && (
              <input
                autoFocus
                value={promptValue}
                onChange={e => setPromptValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleConfirm()
                  if (e.key === 'Escape') handleCancel()
                }}
                className='w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 mb-4'
              />
            )}

            <div className='flex justify-end gap-2'>
              <button
                onClick={handleCancel}
                className='px-3.5 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors'>
                {current.cancelText || '取消'}
              </button>
              <button
                onClick={handleConfirm}
                className={`px-3.5 py-1.5 rounded-lg text-white text-sm font-medium transition-colors ${
                  current.danger
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}>
                {current.confirmText || '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  )
}

export function useDialog() {
  const context = useContext(DialogContext)
  if (!context) throw new Error('useDialog must be used within DialogProvider')
  return context
}
