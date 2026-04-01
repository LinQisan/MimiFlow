'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'

type DialogKind = 'alert' | 'confirm' | 'prompt'

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

type DialogContextType = {
  alert: (
    message: string,
    options?: { title?: string; confirmText?: string; danger?: boolean },
  ) => Promise<void>
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
  const [promptValue, setPromptValue] = useState('')

  const current = queue[0] || null

  const push = useCallback((request: DialogRequest) => {
    setQueue(prev => [...prev, request])
  }, [])

  const closeCurrent = useCallback(() => {
    setQueue(prev => prev.slice(1))
    setPromptValue('')
  }, [])

  const api = useMemo<DialogContextType>(
    () => ({
      alert: (message, options) =>
        new Promise<void>(resolve => {
          push({
            kind: 'alert',
            title: options?.title || '提示',
            message,
            confirmText: options?.confirmText || '知道了',
            danger: options?.danger || false,
            resolve: () => resolve(),
          })
        }),
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
    [push],
  )

  React.useEffect(() => {
    if (current?.kind === 'prompt') {
      setPromptValue(current.defaultValue || '')
    }
  }, [current])

  const handleCancel = () => {
    if (!current) return
    if (current.kind === 'confirm' || current.kind === 'prompt') {
      current.resolve(null)
    } else {
      current.resolve(false)
    }
    closeCurrent()
  }

  const handleConfirm = () => {
    if (!current) return
    if (current.kind === 'alert') {
      current.resolve(true)
    } else if (current.kind === 'confirm') {
      current.resolve(true)
    } else {
      current.resolve(promptValue.trim() ? promptValue : '')
    }
    closeCurrent()
  }

  return (
    <DialogContext.Provider value={api}>
      {children}
      {current && (
        <div className='fixed inset-0 z-1000 flex items-center justify-center p-4'>
          <div
            className='absolute inset-0 bg-gray-900/40 backdrop-blur-sm'
            onClick={handleCancel}
          />
          <div className='relative w-full max-w-sm bg-white rounded-2xl border border-gray-100 shadow-2xl p-5'>
            <h3 className='text-lg font-bold text-gray-900 mb-2'>
              {current.title}
            </h3>
            <p className='text-sm text-gray-600 leading-relaxed whitespace-pre-wrap mb-4'>
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
              {current.kind !== 'alert' && (
                <button
                  onClick={handleCancel}
                  className='px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors'>
                  {current.cancelText || '取消'}
                </button>
              )}
              <button
                onClick={handleConfirm}
                className={`px-4 py-2 rounded-xl text-white text-sm font-medium transition-colors ${
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
