// components/SmartText.tsx
'use client'

import React, { useMemo } from 'react'
import { guessLanguageCode } from '@/utils/langDetector'

interface SmartTextProps {
  text: string
  // 大脑调度函数
  onWordClick: (word: string, x: number, y: number) => void
  className?: string
}

export default function SmartText({
  text,
  onWordClick,
  className = '',
}: SmartTextProps) {
  // ================= 🌟 1. 移动端：AI 智能分词计算 (保留不变) =================
  const words = useMemo(() => {
    if (!text) return []
    const detectedLang = guessLanguageCode(text)
    if (typeof window === 'undefined' || !window.Intl || !Intl.Segmenter) {
      const fallbackSplit = ['zh', 'ja', 'ko'].includes(detectedLang)
        ? text.split('')
        : text.split(' ')
      return fallbackSplit.map((word, i) => ({
        segment: word,
        isWordLike: word.trim().length > 0,
        id: `fallback-${i}`,
      }))
    }
    const segmenter = new Intl.Segmenter(detectedLang, { granularity: 'word' })
    return Array.from(segmenter.segment(text)).map((seg, index) => ({
      ...seg,
      id: `word-${index}`,
    }))
  }, [text])

  // ================= 🌟 2. 核心修复 (b) 电脑端：处理真正的划词动作 =================
  // 此函数监听 mouseup 事件
  const handleDesktopSelection = (e: React.MouseEvent) => {
    if (typeof window === 'undefined' || window.innerWidth < 768) return

    // 获取用户刚才用鼠标滑出的系统原生选区
    const selection = window.getSelection()
    const selectedText = selection?.toString().trim()

    // 只有当用户真的划选了文字（无论是拖拽还是双击单词）才触发
    if (selectedText && selection && selection.rangeCount > 0) {
      // 🌟 核心：掐断冒泡。
      // 这个 mouseup 是点击事件的一部分，必须阻断，防止外层 onClick 关闭气泡。
      e.stopPropagation()
      e.preventDefault()

      // 获取用户选中的那段文字在屏幕上的精确物理坐标
      const range = selection.getRangeAt(0)
      const rect = range.getBoundingClientRect()

      // 算出选区的正中间位置
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top

      // 将选中的文字和坐标抛给父组件的大脑
      onWordClick(selectedText, centerX, centerY)
    }
  }

  // ================= 🌟 核心修复 (c) 电脑端：处理选区点击拦截 =================
  // 处理随后的 click 事件。如果选区存在文本，掐断冒泡。
  const handleDesktopClick = (e: React.MouseEvent) => {
    if (typeof window === 'undefined' || window.innerWidth < 768) return
    const selection = window.getSelection()
    // 如果点击时系统检测到有选区（通常是刚划选完），掐断冒泡，保护气泡。
    if (selection && selection.toString().trim() !== '') {
      e.stopPropagation()
      e.preventDefault()
    }
  }

  return (
    <span className={`transition-all duration-300 ${className}`}>
      {/* 📱 移动端视图 (宽度 < 768px)：点读模式 */}
      <span className='md:hidden'>
        {words.length === 0 ? (
          <span className='text-gray-400 opacity-60 whitespace-pre'>
            {text}
          </span>
        ) : (
          words.map((wordObj: any) => {
            if (!wordObj.isWordLike) {
              return (
                <span
                  key={wordObj.id}
                  className='whitespace-pre text-gray-500 opacity-80'>
                  {wordObj.segment}
                </span>
              )
            }
            return (
              <span
                key={wordObj.id}
                onClick={e => {
                  e.stopPropagation() // 点单词不要触发整句播放
                  const rect = e.currentTarget.getBoundingClientRect()
                  onWordClick(
                    wordObj.segment,
                    rect.left + rect.width / 2,
                    rect.top,
                  )
                }}
                className='cursor-pointer hover:bg-indigo-100 hover:text-indigo-700 transition-colors rounded px-0.5 active:bg-indigo-200'>
                {wordObj.segment}
              </span>
            )
          })
        )}
      </span>

      {/* 💻 电脑端视图 (宽度 >= 768px)：原生划词模式 */}
      {/* 🌟 核心修复 (a) 真·手动选词: 这才是你想要的原生文字！ */}
      <span
        className='hidden md:inline select-text md:cursor-text'
        // 🌟 核心：监听真正的划词动作
        onMouseUp={handleDesktopSelection}
        // 🌟 核心：拦截随后可能触发的点击关闭冒泡
        onClick={handleDesktopClick}>
        {text}
      </span>
    </span>
  )
}
