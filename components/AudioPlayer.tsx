'use client'

import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { saveVocabulary } from '@/app/actions/vocabulary'
import { addSentenceToReview } from '@/app/actions/fsrs' // 🌟 引入 FSRS 动作

// ================= 类型定义 =================
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
  levelId: string
}

interface Props {
  lesson: PlayerLesson
  lessonGroup: PlayerLessonGroup
  prevId: string | null
  nextId: string | null
}

// ================= 主控组件 (大脑) =================
export default function AudioPlayer({
  lesson,
  lessonGroup,
  prevId,
  nextId,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)

  // 音频相关状态
  const [activeId, setActiveId] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [isBlindMode, setIsBlindMode] = useState(false)
  const [loopId, setLoopId] = useState<number | null>(null)

  // 划词相关状态
  const [selectedWord, setSelectedWord] = useState('')
  const [selectedDialogueId, setSelectedDialogueId] = useState<number | null>(
    null,
  )
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0, isTop: true })

  // 🌟 修改：将原来的 isSaving (boolean) 改为一个具体的枚举状态
  const [wordSaveState, setWordSaveState] = useState<
    'idle' | 'saving' | 'success' | 'already_exists' | 'error'
  >('idle')

  // 🌟 新增：用于跟踪句子收藏操作的状态
  const [savingDialogueId, setSavingDialogueId] = useState<number | null>(null)
  const [dialogueSaveState, setDialogueSaveState] = useState<
    'idle' | 'saving' | 'success' | 'already_exists' | 'error'
  >('idle')

  // ---------------- 音频控制逻辑 ----------------
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

  const handleSentenceClick = (item: DialogueItem) => {
    const selection = window.getSelection()
    if (selection && selection.toString().trim().length > 0) return
    if (selectedWord) {
      setSelectedWord('')
      return
    }

    const audio = audioRef.current
    if (!audio) return

    if (loopId !== null && loopId !== item.id) setLoopId(null)

    if (isPlaying && activeId === item.id) {
      audio.pause()
    } else {
      audio.currentTime = item.start
      audio.play()
    }
  }

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

  // ---------------- 划词与复习逻辑 ----------------
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

        const screenWidth = window.innerWidth
        if (x < 110) x = 110
        if (x > screenWidth - 110) x = screenWidth - 110
        if (rect.top < 60) {
          y = rect.bottom + 10
          isTop = false
        }

        setSelectedWord(text)
        setSelectedDialogueId(item.id)
        setTooltipPos({ x, y, isTop })
      } else {
        setSelectedWord('')
      }
    }, 50)
  }

  const handleSaveWord = async () => {
    if (!selectedWord || !selectedDialogueId) return

    // 开启 saving 状态
    setWordSaveState('saving')

    try {
      // 🌟 发起真实的数据库请求
      const res = await saveVocabulary(selectedWord, selectedDialogueId)

      // 根据后端响应设置对应状态
      if (res.success) {
        setWordSaveState('success')
      } else {
        setWordSaveState('already_exists')
      }

      // 🌟 细节：1.5秒后，自动关掉 Tooltip，并恢复按钮状态
      setTimeout(() => {
        setWordSaveState('idle')
        setSelectedWord('')
        window.getSelection()?.removeAllRanges()
      }, 1500)
    } catch (error) {
      // 显示错误状态，并短时间后恢复
      setWordSaveState('error')
      setTimeout(() => setWordSaveState('idle'), 2000)
    }
  }

  // 🌟 修改：handleAddToReview (替换 alert 为内联确认动画)
  const handleAddToReview = async (e: React.MouseEvent, dialogueId: number) => {
    e.stopPropagation() // 防止触发播放

    // 开启当前句子的内联确认 Loading
    setSavingDialogueId(dialogueId)
    setDialogueSaveState('saving')

    try {
      const res = await addSentenceToReview(dialogueId)

      // 根据结果设置对应徽章状态
      if (res.success) {
        setDialogueSaveState('success')
      } else {
        setDialogueSaveState('already_exists')
      }

      // 🌟 细节：1.5秒后，自动关掉内联展开的抽屉，恢复按钮原状
      setTimeout(() => {
        setSavingDialogueId(null)
        setDialogueSaveState('idle')
      }, 1500)
    } catch (error) {
      setDialogueSaveState('error')
      setTimeout(() => {
        setSavingDialogueId(null)
        setDialogueSaveState('idle')
      }, 2000)
    }
  }

  // 🌟 专为“点词成金”设计的瞬间响应函数
  const handleWordClick = (
    word: string,
    x: number,
    y: number,
    dialogueId: number,
  ) => {
    let finalY = y - 10
    let isTop = true

    // 智能防遮挡：如果是手机屏幕，强制把气泡显示在单词下方！
    if (window.innerWidth < 768 || y < 60) {
      finalY = y + 35 // 给手指留出视线空间
      isTop = false
    }

    // 瞬间更新状态，0延迟呼出气泡！
    setSelectedWord(word)
    setSelectedDialogueId(dialogueId)
    setTooltipPos({ x, y: finalY, isTop })
  }
  // ---------------- 副作用钩子 ----------------
  useEffect(() => {
    // 只有在气泡显示的时候才需要监听，节省性能
    if (!selectedWord) return

    const handleScrollOrResize = () => {
      setSelectedWord('')
      setWordSaveState('idle') // 重置保存状态
      window.getSelection()?.removeAllRanges() // 清除浏览器默认的高亮蓝底
    }

    // 监听全局滚动和窗口大小变化
    // { passive: true } 是性能优化，告诉浏览器这个事件不会阻塞页面滚动
    window.addEventListener('scroll', handleScrollOrResize, { passive: true })
    window.addEventListener('resize', handleScrollOrResize)

    // 注意：如果你页面的滚动条不是在 window 上，而是在某个特定的 div 上
    // (比如 <main className="overflow-y-auto h-screen">)
    // 你需要给那个 div 加上 onScroll 事件，或者在这里获取那个 DOM 并 addEventListener

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [selectedWord])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    let animationFrameId: number

    const syncHighlight = () => {
      const currentTime = audio.currentTime
      if (loopId !== null) {
        const loopItem = lesson.dialogue.find(d => d.id === loopId)
        if (loopItem && currentTime >= loopItem.end)
          audio.currentTime = loopItem.start
      }
      const currentItem = lesson.dialogue.find(
        d => currentTime >= d.start && currentTime <= d.end,
      )
      setActiveId(prev => (currentItem ? currentItem.id : prev))
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

  useEffect(() => {
    if (activeId !== null) {
      const element = document.getElementById(`sentence-${activeId}`)
      if (element)
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeId])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 防止输入框误触
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.code === 'Space') {
        e.preventDefault()

        const audio = audioRef.current
        if (!audio) return

        if (audio.paused) {
          audio.play()
        } else {
          audio.pause()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // ---------------- 渲染主视图 ----------------
  return (
    <div className='max-w-2xl mx-auto p-5 relative'>
      <audio ref={audioRef} src={lesson.audioFile} preload='metadata' />

      {/* 拆分后的 UI 组件 */}
      <SelectionTooltip
        selectedWord={selectedWord}
        tooltipPos={tooltipPos}
        wordSaveState={wordSaveState} // 传入状态
        onSave={handleSaveWord}
      />

      <PlayerHeader
        lesson={lesson}
        lessonGroup={lessonGroup}
        prevId={prevId}
        nextId={nextId}
        isBlindMode={isBlindMode}
        setIsBlindMode={setIsBlindMode}
        playbackRate={playbackRate}
        togglePlaybackRate={togglePlaybackRate}
      />

      {/* 句子列表区 */}
      <div className='space-y-4 pb-64'>
        {lesson.dialogue.map(item => (
          <SentenceRow
            key={item.id}
            item={item}
            isActive={activeId === item.id}
            isLooping={loopId === item.id}
            isBlindMode={isBlindMode}
            savingDialogueId={savingDialogueId} // 传入正在保存的ID
            dialogueSaveState={dialogueSaveState} // 传入状态
            onClick={() => handleSentenceClick(item)}
            onMouseUp={(e: React.MouseEvent | React.TouchEvent) =>
              handleTextSelection(e, item)
            }
            onToggleLoop={(e: React.MouseEvent) => toggleLoop(e, item)}
            onAddToReview={(e: React.MouseEvent) =>
              handleAddToReview(e, item.id)
            }
            onWordClick={handleWordClick}
          />
        ))}
      </div>
    </div>
  )
}

// ================= 子组件 1：划词气泡 =================
interface SelectionTooltipProps {
  selectedWord: string
  tooltipPos: { x: number; y: number; isTop: boolean }
  wordSaveState: 'idle' | 'saving' | 'success' | 'already_exists' | 'error'
  onSave: () => void
}

function SelectionTooltip({
  selectedWord,
  tooltipPos,
  wordSaveState,
  onSave,
}: SelectionTooltipProps) {
  if (!selectedWord) return null

  // 🌟 使用 useMemo 根据状态生成按钮的文案、颜色和图标
  const { label, color, icon } = React.useMemo(() => {
    switch (wordSaveState) {
      case 'idle':
        return {
          label: '生词',
          color: 'bg-blue-600 text-white hover:bg-blue-500',
          icon: (
            <svg
              className='w-4 h-4'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M12 4v16m8-8H4'
              />
            </svg>
          ),
        }
      case 'saving':
        return {
          label: '保存中',
          color: 'bg-blue-500/20 text-blue-300 cursor-not-allowed',
          icon: (
            <svg
              className='animate-spin h-4 w-4 text-blue-300'
              fill='none'
              viewBox='0 0 24 24'>
              <circle
                className='opacity-25'
                cx='12'
                cy='12'
                r='10'
                stroke='currentColor'
                strokeWidth='3'></circle>
              <path
                className='opacity-75'
                fill='currentColor'
                d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'></path>
            </svg>
          ),
        }
      case 'success':
        return {
          label: '已收藏',
          color: 'bg-green-100/20 text-green-300',
          icon: (
            <svg
              className='w-4 h-4 text-green-300'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M5 13l4 4L19 7'
              />
            </svg>
          ),
        }
      case 'already_exists':
        return {
          label: '已在生词本',
          color: 'bg-yellow-100/20 text-yellow-300',
          icon: (
            <svg
              className='w-4 h-4 text-yellow-300'
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
          ),
        }
      case 'error':
        return {
          label: '保存失败',
          color: 'bg-red-100/20 text-red-300',
          icon: (
            <svg
              className='w-4 h-4 text-red-300'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z'
              />
            </svg>
          ),
        }
      default:
        return {
          label: '生词',
          color: 'bg-blue-600 text-white hover:bg-blue-500',
          icon: (
            <svg
              className='w-4 h-4'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M12 4v16m8-8H4'
              />
            </svg>
          ),
        }
    }
  }, [wordSaveState])

  return (
    <div
      className={`fixed z-50 flex flex-col items-center pointer-events-auto transform -translate-x-1/2 transition-all duration-300 ease-out ${tooltipPos.isTop ? '-translate-y-full opacity-100 scale-100' : 'opacity-100 scale-100'}`}
      style={{ left: tooltipPos.x, top: tooltipPos.y }}>
      {!tooltipPos.isTop && (
        <div className='w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-b-8 border-b-gray-900'></div>
      )}

      {/* 🌟 核心气泡面板：高级黑透毛玻璃 + 光泽边框 */}
      <div className='bg-gray-900/95 backdrop-blur-md pl-4 pr-2 py-2 rounded-2xl shadow-2xl ring-1 ring-white/10 flex items-center gap-3 relative'>
        {/* 选中的单词：加粗，略带极淡的蓝色 */}
        <span className='font-bold text-lg max-w-37.5 truncate tracking-wide text-blue-50'>
          {selectedWord}
        </span>

        {/* 分割线：柔和的深灰色 */}
        <div className='w-px h-5 bg-gray-700/80 rounded-full'></div>

        {/* 🌟 收藏按钮：胶囊按钮 + Loading 转圈动画，原生 alert() 已干掉 */}
        <button
          onClick={onSave}
          disabled={wordSaveState === 'saving'}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium text-sm transition-all duration-300 ease-out h-8 overflow-hidden whitespace-nowrap
            ${color} shadow-[0_0_12px_rgba(79,70,229,0.2)]
            ${wordSaveState === 'idle' ? 'hover:-translate-y-0.5 shadow-[0_0_16px_rgba(79,70,229,0.4)]' : ''}
          `}>
          {/* 按钮内部内联切换 */}
          <div
            className={`flex items-center gap-1.5 transition-all duration-300 ease-out`}>
            {icon}
            <span>{label}</span>
          </div>
        </button>
      </div>

      {/* 箭头朝下 */}
      {tooltipPos.isTop && (
        <div className='w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-t-8 border-t-gray-900'></div>
      )}
    </div>
  )
}

// ================= 子组件 2：吸顶头部导航 =================
interface PlayerHeaderProps {
  lesson: PlayerLesson
  lessonGroup: PlayerLessonGroup
  prevId: string | null
  nextId: string | null
  isBlindMode: boolean
  setIsBlindMode: (val: boolean) => void
  playbackRate: number
  togglePlaybackRate: () => void
}

function PlayerHeader({
  lesson,
  lessonGroup,
  prevId,
  nextId,
  isBlindMode,
  setIsBlindMode,
  playbackRate,
  togglePlaybackRate,
}: any) {
  return (
    <div className='sticky top-0 z-20 bg-white/95 backdrop-blur-sm pt-6 pb-4 mb-6 border-b border-gray-100 shadow-sm -mx-5 px-5'>
      <div className='flex justify-between items-center mb-4'>
        <Link
          href={`/level/${lessonGroup.levelId}`}
          className='inline-flex items-center text-gray-500 hover:text-blue-600 transition-colors font-medium'>
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
        <div className='flex gap-2 md:gap-3'>
          <button
            onClick={() => setIsBlindMode(!isBlindMode)}
            className={`px-3 md:px-4 py-2 rounded-full text-xs md:text-sm font-medium transition-colors flex items-center gap-1.5 ${isBlindMode ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
            盲听模式
          </button>
          <button
            onClick={togglePlaybackRate}
            className='bg-gray-100 text-gray-700 px-3 md:px-4 py-2 rounded-full text-xs md:text-sm font-medium transition-colors'>
            {playbackRate}x
          </button>
        </div>
      </div>
      <div className='grid grid-cols-[3rem_1fr_3rem] items-center gap-2 w-full'>
        <div>
          {prevId && (
            <Link
              href={`/lesson/${prevId}`}
              className='inline-flex p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-green-100 hover:text-green-600 transition-colors'>
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
        <h1 className='text-center font-semibold text-base md:text-lg truncate min-w-0'>
          {lessonGroup.name} {lesson.title}
        </h1>
        <div className='flex justify-end'>
          {nextId && (
            <Link
              href={`/lesson/${nextId}`}
              className='inline-flex p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-green-100 hover:text-green-600 transition-colors'>
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
  )
}

// ================= 子组件 3：单行字幕 UI =================
// ================= 子组件 3：单行字幕 UI =================
interface SentenceRowProps {
  item: any
  isActive: boolean
  isLooping: boolean
  isBlindMode: boolean
  savingDialogueId: number | null
  dialogueSaveState: 'idle' | 'saving' | 'success' | 'already_exists' | 'error'
  onClick: () => void
  onMouseUp: (e: React.MouseEvent | React.TouchEvent) => void
  onToggleLoop: (e: React.MouseEvent) => void
  onAddToReview: (e: React.MouseEvent) => void
  onWordClick: (word: string, x: number, y: number, dialogueId: number) => void
}

// 🌟 轻量级自动语种推断器
const guessLanguageCode = (text: string): string => {
  if (!text) return 'en'

  // 1. 日文：只要包含平假名 (\u3040-\u309F) 或 片假名 (\u30A0-\u30FF)
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja'

  // 2. 韩文：只要包含谚文 (\uAC00-\uD7AF)
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko'

  // 3. 中文：包含中日韩统一表意文字 (\u4E00-\u9FFF)，且前面没有命中日韩
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh'

  // 4. 俄文/西里尔字母
  if (/[\u0400-\u04FF]/.test(text)) return 'ru'

  // 5. 默认兜底：英文及其他印欧语系（法、德、西等）。
  // 它们的分词逻辑高度一致，都是基于空格和标点符号，用 'en' 规则分词完全没问题。
  return 'en'
}

function SentenceRow({
  item,
  isActive,
  isLooping,
  isBlindMode,
  savingDialogueId,
  dialogueSaveState,
  onClick,
  onMouseUp,
  onToggleLoop,
  onAddToReview,
  onWordClick,
}: SentenceRowProps) {
  // 🌟 使用 useMemo 根据状态生成纯图标和颜色
  const { saveIcon, saveBgClass } = React.useMemo(() => {
    switch (dialogueSaveState) {
      case 'saving':
        return {
          saveIcon: (
            <svg
              className='animate-spin w-5 h-5 text-blue-300'
              fill='none'
              viewBox='0 0 24 24'>
              <circle
                className='opacity-25'
                cx='12'
                cy='12'
                r='10'
                stroke='currentColor'
                strokeWidth='3'></circle>
              <path
                className='opacity-75'
                fill='currentColor'
                d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'></path>
            </svg>
          ),
          saveBgClass: 'bg-blue-100 cursor-not-allowed',
        }
      case 'success':
        return {
          saveIcon: (
            <svg
              className='w-5 h-5'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M5 13l4 4L19 7'
              />
            </svg>
          ),
          saveBgClass: 'bg-green-100 text-green-600',
        }
      case 'already_exists':
        return {
          saveIcon: (
            <svg
              className='w-5 h-5'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'
              />
            </svg>
          ),
          saveBgClass: 'bg-yellow-100 text-yellow-600',
        }
      case 'error':
        return {
          saveIcon: (
            <svg
              className='w-5 h-5'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M6 18L18 6M6 6l12 12'
              />
            </svg>
          ),
          saveBgClass: 'bg-red-100 text-red-600',
        }
      default:
        return {
          saveIcon: (
            <svg
              className='w-5 h-5'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z'
              />
            </svg>
          ),
          saveBgClass:
            'bg-blue-50 text-blue-500 hover:bg-blue-100 hover:text-blue-600',
        }
    }
  }, [dialogueSaveState])

  const words = React.useMemo(() => {
    // 1. 自动嗅探当前句子的语言
    const detectedLang = guessLanguageCode(item.text)

    // 2. 兼容性兜底：如果用户的浏览器太老不支持 Intl.Segmenter
    if (!window.Intl || !Intl.Segmenter) {
      // 英文按空格切，中文/日文老老实实按单字切（虽然不完美，但不至于报错）
      const fallbackSplit = ['zh', 'ja', 'ko'].includes(detectedLang)
        ? item.text.split('')
        : item.text.split(' ')

      return fallbackSplit.map((word: any, i: any) => ({
        segment: word,
        isWordLike: word.trim().length > 0,
        id: `${item.id}-fallback-${i}`,
      }))
    }

    // 3. 召唤系统级 AI 分词引擎
    const segmenter = new Intl.Segmenter(detectedLang, { granularity: 'word' })
    const segments = Array.from(segmenter.segment(item.text))

    // 给每个片段加上唯一 key
    return segments.map((seg, index) => ({
      ...seg,
      id: `${item.id}-word-${index}`,
    }))
  }, [item.text]) // 依赖项只需监听文本变化

  return (
    // 🌟 核心修改 1：最外层使用 Flex 布局，把卡片和按钮组左右分开
    <div
      id={`sentence-${item.id}`}
      className='group flex items-center gap-2 md:gap-3 scroll-mt-32'>
      {/* ================= 左侧：纯净的文字卡片 ================= */}
      {/* ================= 左侧：纯净的文字卡片 ================= */}
      <div
        onClick={onClick}
        onMouseUp={onMouseUp}
        onTouchEnd={onMouseUp}
        className={`flex-1 min-w-0 p-4 md:p-5 rounded-2xl cursor-pointer transition-all duration-300 shadow-sm text-lg md:text-xl leading-relaxed select-text border
          ${
            isActive
              ? 'bg-blue-50 text-blue-500 font-bold border-blue-200 scale-[1.02] shadow-lg shadow-blue-200/50'
              : 'bg-white text-gray-800 border-gray-100 hover:border-blue-100 hover:bg-blue-50/30 hover:shadow-md'
          }
        `}>
        {/* 用一个外层 div 统一控制盲听模式的模糊效果 */}
        <div
          className={`transition-all duration-500 min-w-0 ${isBlindMode && !isActive ? 'blur-sm opacity-40 group-hover:blur-none group-hover:opacity-100' : ''}`}>
          {/* 📱 移动端专属视图 (宽度 < 768px 时显示)：点读模式 */}
          <span className='md:hidden'>
            {words.map((wordObj: any) => {
              if (!wordObj.isWordLike) {
                return (
                  <span
                    key={wordObj.id}
                    className='whitespace-pre text-gray-400 opacity-60'>
                    {wordObj.segment}
                  </span>
                )
              }
              return (
                <span
                  key={wordObj.id}
                  onClick={e => {
                    e.stopPropagation()
                    const rect = e.currentTarget.getBoundingClientRect()
                    const x = rect.left + rect.width / 2
                    const y = rect.top
                    onWordClick(wordObj.segment, x, y, item.id)
                  }}
                  onMouseUp={e => e.stopPropagation()}
                  onTouchEnd={e => e.stopPropagation()}
                  className='cursor-pointer hover:bg-blue-200 hover:text-blue-800 transition-colors rounded px-0.5 active:bg-blue-300'>
                  {wordObj.segment}
                </span>
              )
            })}
          </span>

          {/* 💻 电脑端专属视图 (宽度 >= 768px 时显示)：原生整句模式 */}
          <span className='hidden md:inline'>{item.text}</span>
        </div>
      </div>

      {/* ================= 右侧：上下排布的纯图标按钮组 ================= */}
      {/* 🌟 核心修改 2：预留固定的宽度(w-10)并使用 flex-col 垂直排列 */}
      <div
        className={`flex flex-col gap-2 shrink-0 w-10 md:w-12 transition-all duration-400 ease-out
          ${
            isActive || savingDialogueId === item.id
              ? 'opacity-100 translate-x-0 pointer-events-auto'
              : 'opacity-0 translate-x-4 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto'
          }
        `}>
        {/* 1. 收藏按钮 */}
        <button
          onClick={onAddToReview}
          title='加入跟读训练库'
          disabled={savingDialogueId === item.id}
          className={`w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-xl md:rounded-2xl transition-all duration-300 shadow-sm
            ${
              savingDialogueId === item.id
                ? saveBgClass
                : isActive
                  ? 'bg-blue-500/30 text-white hover:bg-blue-500' // 选中时的半透明态
                  : saveBgClass // 默认淡蓝态
            }
          `}>
          {saveIcon}
        </button>

        {/* 2. 单句复读按钮 */}
        <button
          onClick={onToggleLoop}
          title='单句复读'
          className={`w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-xl md:rounded-2xl transition-all duration-300 shadow-sm
            ${
              isLooping
                ? 'bg-blue-600 text-white shadow-md ring-4 ring-blue-500/20'
                : isActive
                  ? 'bg-blue-500/30 text-white hover:bg-blue-500'
                  : 'bg-blue-50 text-blue-500 hover:bg-blue-100 hover:text-blue-600'
            }
          `}>
          <svg
            className='w-5 h-5 md:w-6 md:h-6'
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
    </div>
  )
}
