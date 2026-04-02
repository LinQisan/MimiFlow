'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Language, useI18n } from '@/context/I18nContext'

export default function LanguageSwitcher() {
  const { lang, setLang } = useI18n()
  const [mounted, setMounted] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null) // 🌟 监听外部点击的引用

  useEffect(() => {
    setMounted(true)
  }, [])

  // 🌟 新增：点击菜单外部区域，自动收起菜单，提升交互体验
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  if (!mounted) return null

  const languages = [
    { code: 'zh', label: '简', fullName: '简体中文' },
    { code: 'en', label: 'EN', fullName: 'English' },
    { code: 'ja', label: '日', fullName: '日本語' },
  ]

  return (
    // 🌟 核心：改成 relative inline-block，让它规规矩矩地待在正常的布局流中！
    <div className='relative z-[100] inline-block' ref={dropdownRef}>
      {/* 主按钮：去掉了厚重的毛玻璃背景，改为极简的悬停变色，完美融入 Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`ui-btn ui-btn-sm w-9 px-0 transition-colors duration-200
          ${isOpen ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}
        `}
        title='切换语言 / Language'>
        <svg
          className='w-5 h-5'
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'>
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            d='M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
          />
        </svg>
      </button>

      {/* 🌟 下拉菜单：绝对定位在按钮正下方，自带优雅进入动画 */}
      {isOpen && (
        <div className='ui-pop absolute right-0 top-full mt-2 w-36 bg-white border border-gray-100 p-2 z-[120] animate-in fade-in slide-in-from-top-2 duration-200'>
          <div className='flex flex-col gap-1'>
            {languages.map(l => (
                <button
                  key={l.code}
                  onClick={() => {
                    setLang(l.code as Language)
                    setIsOpen(false)
                  }}
                  className={`flex items-center gap-3 px-3 ui-mobile-py-sm transition-colors duration-150 w-full
                  ${
                    lang === l.code
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'bg-transparent text-gray-600 hover:bg-gray-50'
                  }
                `}>
                <span
                  className={`text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${lang === l.code ? 'bg-indigo-200/50 text-indigo-800' : 'bg-gray-100 text-gray-500'}`}>
                  {l.label}
                </span>
                <span
                  className={`text-sm ${lang === l.code ? 'font-bold' : 'font-medium'}`}>
                  {l.fullName}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
