'use client'

import React, { useState, useEffect } from 'react'
import { useI18n } from '@/context/I18nContext'

export default function LanguageSwitcher() {
  const { lang, setLang } = useI18n()

  // 🌟 核心：防止 Next.js 服务端渲染 (SSR) 和客户端状态不一致导致报错
  const [mounted, setMounted] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // 在客户端挂载前不渲染，避免闪烁
  if (!mounted) return null

  const languages = [
    { code: 'zh', label: '简', fullName: '简体中文' },
    { code: 'en', label: 'EN', fullName: 'English' },
    { code: 'ja', label: '日', fullName: '日本語' }, // 如果你需要日语的话
  ]

  const currentLang = languages.find(l => l.code === lang) || languages[0]

  return (
    <div className='fixed top-6 right-6 z-100 flex flex-col items-end gap-2'>
      {/* 🌟 1. 主按钮：毛玻璃地球仪图标 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className='w-12 h-12 rounded-full bg-white/80 backdrop-blur-md shadow-lg border border-white/40 flex items-center justify-center text-gray-700 hover:text-indigo-600 hover:scale-105 transition-all duration-300 z-10'
        title='切换语言 / Language'>
        <svg
          className='w-6 h-6'
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'>
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={1.5}
            d='M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
          />
        </svg>
      </button>

      {/* 🌟 2. 展开的语言菜单：带有弹簧般的滑出动画 */}
      <div
        className={`flex flex-col gap-2 transition-all duration-300 origin-bottom ${
          isOpen
            ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 scale-75 translate-y-4 pointer-events-none'
        }`}>
        {languages.map(l => (
          <button
            key={l.code}
            onClick={() => {
              setLang(l.code as any)
              setIsOpen(false) // 选完自动收起
            }}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl backdrop-blur-md border shadow-sm transition-all duration-200
              ${
                lang === l.code
                  ? 'bg-indigo-600/90 border-indigo-500 text-white'
                  : 'bg-white/90 border-white/40 text-gray-700 hover:bg-white hover:text-indigo-600'
              }
            `}>
            <span
              className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${lang === l.code ? 'bg-white/20' : 'bg-gray-100'}`}>
              {l.label}
            </span>
            <span className='text-sm font-medium pr-1'>{l.fullName}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
