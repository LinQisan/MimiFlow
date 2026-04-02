'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Rating } from 'ts-fsrs'
import {
  getDueSentences,
  rateSentenceFluency,
  removeSentenceFromReview,
} from '@/app/actions/fsrs'
import { useDialog } from '@/context/DialogContext'
import InlineConfirmAction from '@/components/InlineConfirmAction'

type ReviewQueueItem = {
  id: string
  reps: number
  dialogue?: {
    text: string
    start: number
    end: number
    lesson: {
      audioFile: string
    }
  }
  context?: {
    prev: string | null
    next: string | null
    playStart: number
    playEnd: number
  }
}

const CONTEXT_MAX_DURATION_SEC = 8
const CONTEXT_LEAD_IN_SEC = 1.8
const CONTEXT_LEAD_OUT_SEC = 1.2

type MemoryProfile = {
  level: 'new' | 'steady' | 'strong'
  speed: number
  repeats: number
  gapMs: number
}

export default function ReviewPage() {
  const dialog = useDialog()
  const [queue, setQueue] = useState<ReviewQueueItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [sessionStarted, setSessionStarted] = useState(false)
  const [autoplayFailed, setAutoplayFailed] = useState(false)

  const audioRef = useRef<HTMLAudioElement>(null)
  const playbackTokenRef = useRef(0)
  const autoplayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    async function fetchQueue() {
      try {
        const sentences = await getDueSentences()
        setQueue(sentences || [])
      } catch (error) {
        console.error(error)
        setQueue([])
      } finally {
        setIsLoading(false)
      }
    }
    fetchQueue()
  }, [])

  const currentItem = queue[currentIndex]

  const memoryProfile: MemoryProfile = (() => {
    const reps = currentItem?.reps || 0
    if (reps <= 2) {
      return {
        level: 'new',
        speed: 0.9,
        repeats: 3,
        gapMs: 900,
      }
    }
    if (reps <= 6) {
      return {
        level: 'steady',
        speed: 1.0,
        repeats: 2,
        gapMs: 650,
      }
    }
    return {
      level: 'strong',
      speed: 1.1,
      repeats: 1,
      gapMs: 350,
    }
  })()

  const waitForAudioReady = async (audio: HTMLAudioElement, src: string) => {
    if (!audio.src.includes(src)) {
      audio.src = src
      audio.load()
    }
    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) return
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        audio.removeEventListener('loadedmetadata', onReady)
        audio.removeEventListener('canplay', onReady)
        audio.removeEventListener('error', onError)
      }
      const onReady = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error('audio_not_ready'))
      }
      audio.addEventListener('loadedmetadata', onReady, { once: true })
      audio.addEventListener('canplay', onReady, { once: true })
      audio.addEventListener('error', onError, { once: true })
    })
  }

  const playAudio = useCallback(async () => {
    if (!audioRef.current || !currentItem?.dialogue || !currentItem.context) return
    const audio = audioRef.current
    const token = ++playbackTokenRef.current

    const targetSrc = currentItem.dialogue.lesson.audioFile
    try {
      await waitForAudioReady(audio, targetSrc)
    } catch {
      setAutoplayFailed(true)
      return
    }

    const runSegment = async (start: number, end: number) => {
      if (playbackTokenRef.current !== token) return
      if (!Number.isFinite(start) || !Number.isFinite(end)) return
      if (end <= start) return
      const duration = Number.isFinite(audio.duration) ? audio.duration : undefined
      const safeStart = duration
        ? Math.min(Math.max(0, start), Math.max(0, duration - 0.05))
        : Math.max(0, start)
      const safeEnd = duration ? Math.min(end, duration) : end
      if (safeEnd <= safeStart) return
      audio.playbackRate = memoryProfile.speed
      audio.currentTime = safeStart
      try {
        await audio.play()
        setAutoplayFailed(false)
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          setAutoplayFailed(true)
        }
        throw error
      }
      await new Promise<void>(resolve => {
        const handleTimeUpdate = () => {
          if (playbackTokenRef.current !== token || audio.currentTime >= safeEnd) {
            audio.pause()
            audio.removeEventListener('timeupdate', handleTimeUpdate)
            resolve()
          }
        }
        audio.addEventListener('timeupdate', handleTimeUpdate)
      })
    }

    const waitGap = async (ms: number) => {
      if (ms <= 0) return
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, ms)
        if (playbackTokenRef.current !== token) {
          clearTimeout(timer)
          resolve()
        }
      })
    }

    const toSafeSegment = (start: number, end: number, maxDurationSec: number) => {
      const safeStart = Math.max(0, start)
      const safeEnd = Math.max(safeStart + 0.05, end)
      const duration = safeEnd - safeStart
      if (duration <= maxDurationSec) return { start: safeStart, end: safeEnd }
      const center = (safeStart + safeEnd) / 2
      const half = maxDurationSec / 2
      return {
        start: Math.max(0, center - half),
        end: Math.max(center - half + 0.05, center + half),
      }
    }

    const contextStart = currentItem.context.playStart ?? currentItem.dialogue.start
    const contextEnd = currentItem.context.playEnd ?? currentItem.dialogue.end
    const focusStart = currentItem.dialogue.start
    const focusEnd = currentItem.dialogue.end

    const contextWindowRawStart = Math.max(contextStart, focusStart - CONTEXT_LEAD_IN_SEC)
    const contextWindowRawEnd = Math.min(contextEnd, focusEnd + CONTEXT_LEAD_OUT_SEC)
    const contextWindow = toSafeSegment(
      contextWindowRawStart,
      contextWindowRawEnd,
      CONTEXT_MAX_DURATION_SEC,
    )
    const hasContextWindow = contextWindow.end - contextWindow.start >= 0.35

    try {
      if (hasContextWindow) {
        await runSegment(contextWindow.start, contextWindow.end)
        await waitGap(memoryProfile.gapMs)
      }
      for (let i = 0; i < memoryProfile.repeats; i += 1) {
        await runSegment(focusStart, focusEnd)
        if (i < memoryProfile.repeats - 1) {
          await waitGap(memoryProfile.gapMs)
        }
      }
    } catch {
      return
    }
  }, [currentItem, memoryProfile.gapMs, memoryProfile.repeats, memoryProfile.speed])

  const handleStartSession = () => {
    setSessionStarted(true)
    void playAudio()
  }

  useEffect(() => {
    if (autoplayTimerRef.current) {
      clearTimeout(autoplayTimerRef.current)
      autoplayTimerRef.current = null
    }
    if (currentItem && sessionStarted) {
      autoplayTimerRef.current = setTimeout(() => {
        void playAudio()
      }, 300)
    }
    return () => {
      if (autoplayTimerRef.current) {
        clearTimeout(autoplayTimerRef.current)
        autoplayTimerRef.current = null
      }
    }
  }, [currentItem, playAudio, sessionStarted])

  useEffect(() => {
    return () => {
      playbackTokenRef.current += 1
      if (audioRef.current) audioRef.current.pause()
    }
  }, [])

  const handleRate = async (rating: Rating) => {
    if (isEvaluating || !currentItem) return
    setIsEvaluating(true)
    playbackTokenRef.current += 1
    if (audioRef.current) audioRef.current.pause()

    const res = await rateSentenceFluency(currentItem.id, rating)
    if (res.success) {
      setTimeout(() => {
        setCurrentIndex(prev => prev + 1)
        setIsEvaluating(false)
      }, 300)
    } else {
      await dialog.alert('打分提交失败')
      setIsEvaluating(false)
    }
  }

  const handleRemove = async () => {
    if (!currentItem) return
    setIsEvaluating(true)
    playbackTokenRef.current += 1
    if (audioRef.current) audioRef.current.pause()
    const res = await removeSentenceFromReview(currentItem.id)
    if (res.success) {
      setCurrentIndex(prev => prev + 1)
      dialog.toast('已从复习库移除', { tone: 'success' })
    } else {
      dialog.toast('移除失败', { tone: 'error' })
    }
    setIsEvaluating(false)
  }

  if (isLoading) {
    return (
      <div className='min-h-screen bg-gray-50 p-6 md:p-8'>
        <div className='mx-auto mt-16 max-w-4xl border-b border-gray-200 pb-10 text-center'>
          <p className='text-sm font-semibold text-gray-500'>正在加载复习队列...</p>
        </div>
      </div>
    )
  }

  if (currentIndex >= queue.length) {
    return (
      <div className='min-h-screen bg-gray-50 p-6 md:p-8'>
        <div className='mx-auto mt-16 max-w-4xl border-b border-gray-200 pb-10 text-center'>
          <h1 className='text-2xl font-black text-gray-900'>今日复习完成</h1>
          <p className='mt-3 text-sm font-medium text-gray-500'>很好，今天的跟读任务已经全部完成。</p>
        </div>
      </div>
    )
  }

  if (!sessionStarted) {
    return (
      <div className='min-h-screen bg-gray-50 p-6 md:p-8'>
        <div className='mx-auto mt-16 max-w-4xl border-b border-gray-200 pb-10'>
          <div className='text-center'>
            <h1 className='text-3xl font-black text-gray-900'>跟读复习</h1>
            <p className='mt-3 text-sm font-medium text-gray-500'>
              今日待复习 {queue.length} 句。系统自动采用单一标准跟读流程：先短语境，再目标句重复，你只需专注开口。
            </p>
          </div>
          <div className='mt-4 border-b border-gray-200 bg-gray-50/60 p-3'>
            <p className='text-xs font-bold text-gray-600'>
              为降低操作负担，已取消语境/精听/影子三模式切换。系统会依据熟练度自动微调速度、重复和停顿。
            </p>
          </div>
          <div className='mt-8 flex justify-center'>
            <button onClick={handleStartSession} className='ui-btn ui-btn-primary'>
              <svg className='h-4 w-4' fill='currentColor' viewBox='0 0 24 24'>
                <path d='M8 5v14l11-7z' />
              </svg>
              开始训练
            </button>
          </div>
        </div>
        <audio ref={audioRef} playsInline preload='auto' />
      </div>
    )
  }

  return (
    <main className='min-h-screen bg-gray-50 p-4 md:p-8 flex flex-col relative'>
      <audio ref={audioRef} playsInline preload='auto' />
      <div className='mx-auto mb-3 w-full max-w-4xl'>
        <div className='border-b border-gray-200 bg-gray-50/80 p-2'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <span className='ui-tag ui-tag-info'>标准跟读流程</span>
            <div className='flex flex-wrap items-center gap-1.5'>
              <span className='ui-tag ui-tag-muted'>
                智能记忆: {memoryProfile.level === 'new' ? '新词加强' : memoryProfile.level === 'steady' ? '稳态巩固' : '熟词快练'}
              </span>
              <span className='ui-tag ui-tag-muted'>速度 {memoryProfile.speed}x</span>
              <span className='ui-tag ui-tag-muted'>重复 {memoryProfile.repeats} · 停顿 {memoryProfile.gapMs}ms</span>
            </div>
            <div className='flex flex-wrap items-center gap-1.5'>
              <button type='button' onClick={() => void playAudio()} className='ui-btn ui-btn-sm'>
                重播
              </button>
              <div className='ui-tag ui-tag-info'>进度: {currentIndex + 1} / {queue.length}</div>
              <InlineConfirmAction
                message='确认把当前句子从复习库移除吗？'
                onConfirm={handleRemove}
                triggerLabel='移除'
                confirmLabel='确认移除'
                pendingLabel='移除中...'
                triggerClassName='ui-btn ui-btn-sm ui-btn-danger'
              />
            </div>
          </div>
        </div>
      </div>

      <div className='mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center border-b border-gray-200 px-4 py-6 md:px-8 md:py-8'>
        <div onClick={() => void playAudio()} className='group relative mb-10 w-full cursor-pointer px-2 text-center'>
          {autoplayFailed ? (
            <div className='mb-4 flex justify-center'>
              <span className='flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700'>
                <svg className='h-4 w-4' fill='currentColor' viewBox='0 0 24 24'>
                  <path d='M8 5v14l11-7z' />
                </svg>
                请点击屏幕播放原声
              </span>
            </div>
          ) : (
            <div className='mb-4 flex justify-center opacity-0 transition-opacity group-hover:opacity-100'>
              <span className='flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-500'>
                <svg className='h-3.5 w-3.5' fill='currentColor' viewBox='0 0 24 24'>
                  <path d='M8 5v14l11-7z' />
                </svg>
                点击重播原声
              </span>
            </div>
          )}

          <div className='flex flex-col items-center gap-6'>
            {currentItem.context?.prev && (
              <p className='text-lg font-medium text-gray-400 md:text-xl'>{currentItem.context.prev}</p>
            )}

            <h2 className={`text-3xl font-bold leading-tight transition-colors md:text-4xl md:leading-snug ${autoplayFailed ? 'text-gray-400' : 'text-gray-900'}`}>
              {currentItem.dialogue?.text || '该句子数据缺失'}
            </h2>

            {currentItem.context?.next && (
              <p className='text-lg font-medium text-gray-400 md:text-xl'>{currentItem.context.next}</p>
            )}
          </div>
        </div>

        <div className={`grid w-full max-w-3xl grid-cols-2 gap-3 transition-opacity duration-300 md:grid-cols-4 ${isEvaluating ? 'pointer-events-none opacity-50' : ''}`}>
          <button
            onClick={() => void handleRate(Rating.Again)}
            className='group flex flex-col items-center justify-center border border-rose-200 bg-rose-50 px-3 py-4 transition-colors hover:bg-rose-100'>
            <span className='mb-1 text-base font-bold text-rose-700 transition-transform group-hover:scale-105'>嘴瓢了</span>
            <span className='text-[11px] font-medium text-rose-500'>(&lt; 1分钟重练)</span>
          </button>
          <button
            onClick={() => void handleRate(Rating.Hard)}
            className='group flex flex-col items-center justify-center border border-amber-200 bg-amber-50 px-3 py-4 transition-colors hover:bg-amber-100'>
            <span className='mb-1 text-base font-bold text-amber-700 transition-transform group-hover:scale-105'>勉强跟上</span>
            <span className='text-[11px] font-medium text-amber-500'>(耗脑力/生硬)</span>
          </button>
          <button
            onClick={() => void handleRate(Rating.Good)}
            className='group flex flex-col items-center justify-center border border-emerald-200 bg-emerald-50 px-3 py-4 transition-colors hover:bg-emerald-100'>
            <span className='mb-1 text-base font-bold text-emerald-700 transition-transform group-hover:scale-105'>流畅跟读</span>
            <span className='text-[11px] font-medium text-emerald-500'>(明天再测)</span>
          </button>
          <button
            onClick={() => void handleRate(Rating.Easy)}
            className='group flex flex-col items-center justify-center border border-sky-200 bg-sky-50 px-3 py-4 transition-colors hover:bg-sky-100'>
            <span className='mb-1 text-base font-bold text-sky-700 transition-transform group-hover:scale-105'>完美脱口</span>
            <span className='text-[11px] font-medium text-sky-500'>(形成肌肉记忆)</span>
          </button>
        </div>
      </div>
    </main>
  )
}
