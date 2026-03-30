'use client'

import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { saveVocabulary } from '@/app/actions/vocabulary'

type DialogueItem = {
  id: number
  text: string
  start: number
  end: number
}

type PlayerLesson = {
  id: string
  lessonNum: string
  title: string
  audioFile: string
  dialogue: DialogueItem[]
}

type PlayerLessonGroup = {
  id: string
  name: string
  description?: string | null
  levelId: string
}

interface Props {
  lesson: PlayerLesson // 使用扩展后的类型
  lessonGroup: PlayerLessonGroup // 使用扩展后的类型
  prevId: string | null
  nextId: string | null
}

export default function AudioPlayer({
  lesson,
  lessonGroup,
  prevId,
  nextId,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)

  const [isBlindMode, setIsBlindMode] = useState(false)
  const [loopId, setLoopId] = useState<number | null>(null)

  // 🌟 新增：生词划词相关的状态
  const [selectedWord, setSelectedWord] = useState('')
  const [selectedDialogueId, setSelectedDialogueId] = useState<number | null>(
    null,
  )
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0, isTop: true })
  const [isSaving, setIsSaving] = useState(false)

  // 1. 处理点击句子主体
  const handleSentenceClick = (item: DialogueItem) => {
    const selection = window.getSelection()
    if (selection && selection.toString().trim().length > 0) {
      return
    }

    // 如果悬浮窗开着，点击空白处或句子关掉它
    if (selectedWord) {
      setSelectedWord('')
      return
    }

    const audio = audioRef.current
    if (!audio) return

    if (loopId !== null && loopId !== item.id) {
      setLoopId(null)
    }

    if (isPlaying && activeId === item.id) {
      audio.pause()
    } else {
      audio.currentTime = item.start
      audio.play()
    }
  }

  // 🌟 新增：处理划词动作
  const handleTextSelection = (
    e: React.MouseEvent | React.TouchEvent,
    item: DialogueItem,
  ) => {
    setTimeout(() => {
      const selection = window.getSelection()
      const text = selection?.toString().trim()

      if (text && text.length > 0) {
        const range = selection!.getRangeAt(0)
        const rect = range.getBoundingClientRect()

        let x = rect.left + rect.width / 2
        let y = rect.top - 10
        let isTop = true

        // 🛡️ 边界检测 1：防止左右溢出 (假设气泡最宽大概 200px，一半就是 100px)
        const screenWidth = window.innerWidth
        if (x < 110) x = 110 // 如果太靠左，强制卡在 110px 的位置
        if (x > screenWidth - 110) x = screenWidth - 110 // 如果太靠右，强制往左挤

        // 🛡️ 边界检测 2：防止顶部溢出 (如果文字距离屏幕顶部小于 60px，气泡改到文字下方显示)
        if (rect.top < 60) {
          y = rect.bottom + window.scrollY + 10
          isTop = false
        }

        setSelectedWord(text)
        setSelectedDialogueId(item.id)
        setTooltipPos({ x, y, isTop }) // 把计算好的安全坐标存起来
      } else {
        setSelectedWord('')
      }
    }, 50)
  }

  // 🌟 新增：保存生词的模拟逻辑
  const handleSaveWord = async () => {
    if (!selectedWord || !selectedDialogueId) return
    setIsSaving(true)

    try {
      // 🌟 发起真实的数据库请求
      const res = await saveVocabulary(selectedWord, selectedDialogueId)

      // 成功后清除高亮和浮窗
      setSelectedWord('')
      window.getSelection()?.removeAllRanges()

      // 弹出后端的真实提示（成功或查重拦截）
      alert(res.message)
    } catch (error) {
      alert('网络请求失败，请稍后重试！')
    } finally {
      setIsSaving(false)
    }
  }
  // 2. 处理单句复读
  const toggleLoop = (e: React.MouseEvent, item: DialogueItem) => {
    e.stopPropagation()
    const audio = audioRef.current
    if (!audio) return

    if (loopId === item.id) {
      setLoopId(null)
    } else {
      setLoopId(item.id)
      audio.currentTime = item.start
      audio.play()
    }
  }

  // 3. 切换倍速
  const togglePlaybackRate = () => {
    const audio = audioRef.current
    if (!audio) return
    const nextRate =
      playbackRate === 1
        ? 1.25
        : playbackRate === 1.25
          ? 1.5
          : playbackRate === 1.5
            ? 0.75
            : 1
    audio.playbackRate = nextRate
    setPlaybackRate(nextRate)
  }

  // 4. 音频时间轴同步与复读监听
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    let animationFrameId: number

    const syncHighlight = () => {
      const currentTime = audio.currentTime

      // 单句复读拦截逻辑
      if (loopId !== null) {
        const loopItem = lesson.dialogue.find(d => d.id === loopId)
        if (loopItem && currentTime >= loopItem.end) {
          audio.currentTime = loopItem.start
        }
      }

      // 正常的高亮同步
      const currentItem = lesson.dialogue.find(
        d => currentTime >= d.start && currentTime <= d.end,
      )

      setActiveId(prev => {
        if (currentItem && prev !== currentItem.id) return currentItem.id
        if (!currentItem && prev !== null) return null
        return prev
      })

      animationFrameId = requestAnimationFrame(syncHighlight)
    }

    animationFrameId = requestAnimationFrame(syncHighlight)

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => {
      setIsPlaying(false)
      setActiveId(null)
      setLoopId(null)
    }

    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)

    return () => {
      cancelAnimationFrame(animationFrameId)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
    }
  }, [lesson.dialogue, loopId])

  // 5. 核心：自动平滑滚动逻辑
  useEffect(() => {
    if (activeId !== null) {
      const element = document.getElementById(`sentence-${activeId}`)
      if (element) {
        // 使用 block: 'center' 可以让元素滚动到屏幕正中间，不受顶部吸顶元素的影响
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [activeId])

  return (
    <div className='max-w-2xl mx-auto p-5 relative'>
      {/* 🌟 新增：划词操作悬浮气泡 (Tooltip) */}
      {selectedWord && (
        <div
          className={`fixed z-50 flex flex-col items-center pointer-events-auto transform -translate-x-1/2 transition-all duration-200 ${
            tooltipPos.isTop ? '-translate-y-full' : ''
          }`}
          style={{ left: tooltipPos.x, top: tooltipPos.y }}>
          {/* 如果气泡在文字下方，小箭头朝上 */}
          {!tooltipPos.isTop && (
            <div className='w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-gray-900'></div>
          )}

          <div className='bg-gray-900 text-white px-3 py-2 rounded-xl shadow-xl flex items-center gap-3'>
            <span className='font-medium max-w-37.5 truncate'>
              {selectedWord}
            </span>
            <div className='w-px h-4 bg-gray-600'></div>
            <button
              onClick={handleSaveWord}
              disabled={isSaving}
              className='text-yellow-400 hover:text-yellow-300 font-medium text-sm whitespace-nowrap flex items-center gap-1'>
              {isSaving ? '保存中...' : '收藏'}
            </button>
          </div>

          {/* 如果气泡在文字上方，小箭头朝下 */}
          {tooltipPos.isTop && (
            <div className='w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-gray-900'></div>
          )}
        </div>
      )}
      {/* ================= 吸顶头部区域 ================= */}
      <div className='sticky top-0 z-20 bg-white/95 backdrop-blur-sm pt-6 pb-4 mb-6 border-b border-gray-100 shadow-sm -mx-5 px-5'>
        <div className='flex justify-between items-center mb-4'>
          <Link
            href={`/level/${lessonGroup.levelId}`}
            className='inline-flex items-center text-gray-500 hover:text-green-600 transition-colors font-medium'>
            <svg
              className='w-5 h-5 mr-1'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M10 19l-7-7m0 0l7-7m-7 7h18'
              />
            </svg>
            返回列表
          </Link>

          <div className='flex gap-3'>
            <button
              onClick={() => setIsBlindMode(!isBlindMode)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5
                ${isBlindMode ? 'bg-indigo-100 text-indigo-700 shadow-inner' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
              {isBlindMode ? (
                <svg
                  className='w-4 h-4'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21'
                  />
                </svg>
              ) : (
                <svg
                  className='w-4 h-4'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M15 12a3 3 0 11-6 0 3 3 0 016 0z'
                  />
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'
                  />
                </svg>
              )}
              盲听模式
            </button>

            <button
              onClick={togglePlaybackRate}
              className='bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-1'>
              <svg
                className='w-4 h-4'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z'
                />
              </svg>
              {playbackRate}x
            </button>
          </div>
        </div>

        {/* 使用自定义网格: 左右固定宽度，中间撑开占满剩余空间 */}
        <div className='grid grid-cols-[3rem_1fr_3rem] items-center gap-2 w-full'>
          {/* 左侧区域（即使没有 prevId 也要保留这个空 div 来占位，以维持居中） */}
          <div>
            {prevId && (
              <Link
                href={`/lesson/${prevId}`}
                className='inline-flex p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-green-100 hover:text-green-600 transition-colors'
                title='上一题'
                aria-label='上一题'>
                <svg
                  className='w-5 h-5'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M15 19l-7-7 7-7'
                  />
                </svg>
              </Link>
            )}
          </div>

          {/* 居中标题 */}
          <h1 className='text-center font-semibold text-lg truncate min-w-0'>
            {lessonGroup.name} {lesson.title}
          </h1>

          {/* 右侧区域（同样使用空 div 占位，并让内容靠右） */}
          <div className='flex justify-end'>
            {nextId && (
              <Link
                href={`/lesson/${nextId}`}
                className='inline-flex p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-green-100 hover:text-green-600 transition-colors'
                title='下一题'
                aria-label='下一题'>
                <svg
                  className='w-5 h-5'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M9 5l7 7-7 7'
                  />
                </svg>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ================= 吸顶头部区域 结束 ================= */}

      <audio ref={audioRef} src={lesson.audioFile} preload='metadata' />

      {/* 句子列表 */}
      <div className='space-y-4 pb-64'>
        {lesson.dialogue.map(item => {
          const isActive = activeId === item.id
          const isLooping = loopId === item.id

          return (
            <div
              key={item.id}
              id={`sentence-${item.id}`} // 这是自动滚动寻找的锚点ID
              onClick={() => handleSentenceClick(item)}
              // 🌟 新增：绑定鼠标和触摸的松开事件，触发划词检测
              onMouseUp={e => handleTextSelection(e, item)}
              onTouchEnd={e => handleTextSelection(e, item)}
              className={`
                group p-5 rounded-2xl cursor-pointer transition-all duration-300 shadow-sm text-xl leading-relaxed select-none flex justify-between items-center
                scroll-mt-32 /* 确保锚点距离顶部有一定的外边距，防止被意外遮挡 */
                ${
                  isActive
                    ? 'bg-black text-white scale-[1.02] shadow-lg shadow-black-200'
                    : 'bg-white hover:bg-gray-50 border border-gray-100 text-gray-800 hover:shadow-md'
                }
              `}>
              <span
                className={`transition-all duration-500 flex-1 pr-4
                  ${isBlindMode && !isActive ? 'blur-sm opacity-40 group-hover:blur-none group-hover:opacity-100' : ''}
                `}>
                {item.text}
              </span>

              <button
                onClick={e => toggleLoop(e, item)}
                title='单句复读'
                className={`
                  p-2.5 rounded-full transition-all duration-200 shrink-0
                  ${
                    isLooping
                      ? 'bg-white text-green-600 shadow-sm scale-110'
                      : isActive
                        ? 'text-green-100 hover:text-white hover:bg-green-600'
                        : 'text-gray-300 hover:text-green-500 hover:bg-green-50'
                  }
                `}>
                <svg
                  className='w-5 h-5'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
                  />
                </svg>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
