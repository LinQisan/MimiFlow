// components/ConfirmModal.tsx
'use client'

import React, { useEffect, useState } from 'react'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
  isDanger?: boolean // 如果是删除操作，传 true，按钮会变成红色
  isLoading?: boolean // 点击确认后的 loading 状态
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  onConfirm,
  onCancel,
  isDanger = false,
  isLoading = false,
}: ConfirmModalProps) {
  // 用于控制 CSS 动画的状态
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setShow(true)
      // 防止背景滚动
      document.body.style.overflow = 'hidden'
    } else {
      setShow(false)
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen && !show) return null

  return (
    <div className='fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-0'>
      {/* 背景遮罩 (带毛玻璃效果和淡入动画) */}
      <div
        className={`fixed inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={!isLoading ? onCancel : undefined}></div>

      {/* 弹窗主体 (带缩放弹出动画) */}
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden z-10 transform transition-all duration-300 ${isOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'}`}>
        <div className='p-6'>
          <div className='flex items-center gap-3 mb-4'>
            {/* 图标 */}
            <div
              className={`p-2 rounded-full ${isDanger ? 'bg-red-50 text-red-500' : 'bg-indigo-50 text-indigo-500'}`}>
              {isDanger ? (
                <svg
                  className='w-6 h-6'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
                  />
                </svg>
              ) : (
                <svg
                  className='w-6 h-6'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                  />
                </svg>
              )}
            </div>
            <h3 className='text-xl font-bold text-gray-900'>{title}</h3>
          </div>

          <p className='text-gray-500 text-sm mb-6 leading-relaxed'>
            {message}
          </p>

          <div className='flex gap-3 justify-end'>
            <button
              onClick={onCancel}
              disabled={isLoading}
              className='px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors disabled:opacity-50'>
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className={`px-4 py-2 rounded-xl font-medium text-white flex items-center gap-2 transition-all shadow-sm ${
                isDanger
                  ? 'bg-red-500 hover:bg-red-600 focus:ring-4 focus:ring-red-500/20'
                  : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-600/20'
              } disabled:opacity-70`}>
              {isLoading && (
                <svg
                  className='animate-spin -ml-1 mr-1 h-4 w-4 text-white'
                  fill='none'
                  viewBox='0 0 24 24'>
                  <circle
                    className='opacity-25'
                    cx='12'
                    cy='12'
                    r='10'
                    stroke='currentColor'
                    strokeWidth='4'></circle>
                  <path
                    className='opacity-75'
                    fill='currentColor'
                    d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'></path>
                </svg>
              )}
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
