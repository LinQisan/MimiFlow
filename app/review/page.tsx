// app/review/page.tsx
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

type ShadowMode = 'context' | 'focus' | 'shadow'

const CONTEXT_MAX_DURATION_SEC = 8
const CONTEXT_LEAD_IN_SEC = 1.8
const CONTEXT_LEAD_OUT_SEC = 1.2

type MemoryProfile = {
  level: 'new' | 'steady' | 'strong'
  speed: number
  focusRepeats: number
  shadowRepeats: number
  gapMs: number
}

const MODE_GUIDE: Record<
  ShadowMode,
  { title: string; desc: string; useFor: string }
> = {
  context: {
    title: '语境模式',
    desc: '先听完整语流（含前后文），建立理解和语气感。',
    useFor: '热身与理解优先',
  },
  focus: {
    title: '精听模式',
    desc: '只听目标句，专注发音、重音、停顿和连读。',
    useFor: '纠音与拆句训练',
  },
  shadow: {
    title: '影子模式',
    desc: '先听语境，再重复目标句，训练跟读与即时输出。',
    useFor: '口语输出与流利度',
  },
}

export default function ReviewPage() {
  const dialog = useDialog()
  const [queue, setQueue] = useState<ReviewQueueItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isEvaluating, setIsEvaluating] = useState(false)

  // 🌟 新增 1：用于解锁手机音频的会话状态
  const [sessionStarted, setSessionStarted] = useState(false)
  const [autoplayFailed, setAutoplayFailed] = useState(false) // 兜底：如果解锁失败，显示手动播放提示
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
        focusRepeats: 3,
        shadowRepeats: 3,
        gapMs: 900,
      }
    }
    if (reps <= 6) {
      return {
        level: 'steady',
        speed: 1.0,
        focusRepeats: 2,
        shadowRepeats: 2,
        gapMs: 650,
      }
    }
    return {
      level: 'strong',
      speed: 1.1,
      focusRepeats: 1,
      shadowRepeats: 1,
      gapMs: 350,
    }
  })()
  const autoShadowMode: ShadowMode = (() => {
    const reps = currentItem?.reps || 0
    if (reps <= 1) return 'context'
    if (reps <= 4) return 'focus'
    return 'shadow'
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
      const safeStart = duration ? Math.min(Math.max(0, start), Math.max(0, duration - 0.05)) : Math.max(0, start)
      const safeEnd = duration ? Math.min(end, duration) : end
      if (safeEnd <= safeStart) return
      audio.playbackRate = memoryProfile.speed
      audio.currentTime = safeStart
      try {
        await audio.play()
        setAutoplayFailed(false)
      } catch (error: unknown) {
        console.warn('播放被浏览器拦截:', error)
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
        const timer = setTimeout(() => resolve(), ms)
        if (playbackTokenRef.current !== token) {
          clearTimeout(timer)
          resolve()
        }
      })
    }

    const contextStart = currentItem.context.playStart ?? currentItem.dialogue.start
    const contextEnd = currentItem.context.playEnd ?? currentItem.dialogue.end
    const focusStart = currentItem.dialogue.start
    const focusEnd = currentItem.dialogue.end
    const effectiveRepeat =
      autoShadowMode === 'context'
        ? 1
        : autoShadowMode === 'focus'
          ? memoryProfile.focusRepeats
          : memoryProfile.shadowRepeats
    const effectiveGapMs = autoShadowMode === 'context' ? 0 : memoryProfile.gapMs

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

    const contextWindowRawStart = Math.max(
      contextStart,
      focusStart - CONTEXT_LEAD_IN_SEC,
    )
    const contextWindowRawEnd = Math.min(
      contextEnd,
      focusEnd + CONTEXT_LEAD_OUT_SEC,
    )
    const contextWindow = toSafeSegment(
      contextWindowRawStart,
      contextWindowRawEnd,
      CONTEXT_MAX_DURATION_SEC,
    )
    const hasContextWindow = contextWindow.end - contextWindow.start >= 0.35

    try {
      if (autoShadowMode === 'context') {
        await runSegment(
          hasContextWindow ? contextWindow.start : focusStart,
          hasContextWindow ? contextWindow.end : focusEnd,
        )
        return
      }

      if (autoShadowMode === 'focus') {
        for (let i = 0; i < effectiveRepeat; i += 1) {
          await runSegment(focusStart, focusEnd)
          if (i < effectiveRepeat - 1) await waitGap(effectiveGapMs)
        }
        return
      }

      if (hasContextWindow) {
        await runSegment(contextWindow.start, contextWindow.end)
        await waitGap(effectiveGapMs)
      }
      for (let i = 0; i < effectiveRepeat; i += 1) {
        await runSegment(focusStart, focusEnd)
        if (i < effectiveRepeat - 1) await waitGap(effectiveGapMs)
      }
    } catch {
      return
    }
  }, [autoShadowMode, currentItem, memoryProfile.focusRepeats, memoryProfile.gapMs, memoryProfile.shadowRepeats, memoryProfile.speed])

  // 🌟 新增 2：用户首次点击，解锁音频引擎
  const handleStartSession = () => {
    setSessionStarted(true)
    void playAudio() // 直接在点击事件中调用，100% 能解锁手机浏览器！
  }

  useEffect(() => {
    if (autoplayTimerRef.current) {
      clearTimeout(autoplayTimerRef.current)
      autoplayTimerRef.current = null
    }
    // 🌟 只有当用户点击了开始，且有题目时，才允许自动播放下一题
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
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [])

  const handleRate = async (rating: Rating) => {
    if (isEvaluating) return
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

  if (isLoading)
    return (
      <div className='min-h-screen bg-gray-50 p-6 md:p-8'>
        <div className='mx-auto mt-16 max-w-4xl rounded-3xl border border-gray-200 bg-white p-10 text-center shadow-sm'>
          <p className='text-sm font-semibold text-gray-500'>正在加载复习队列...</p>
        </div>
      </div>
    )

  if (currentIndex >= queue.length) {
    return (
      <div className='min-h-screen bg-gray-50 p-6 md:p-8'>
        <div className='mx-auto mt-16 max-w-4xl rounded-3xl border border-gray-200 bg-white p-10 text-center shadow-sm'>
          <h1 className='text-2xl font-black text-gray-900'>今日复习完成</h1>
          <p className='mt-3 text-sm font-medium text-gray-500'>
            很好，今天的跟读任务已经全部完成。
          </p>
        </div>
      </div>
    )
  }

  // 🌟 新增 3：未开始状态下的“启动大门” UI
  if (!sessionStarted) {
    return (
      <div className='min-h-screen bg-gray-50 p-6 md:p-8'>
        <div className='mx-auto mt-16 max-w-4xl rounded-3xl border border-gray-200 bg-white p-10 shadow-sm'>
          <div className='text-center'>
            <h1 className='text-3xl font-black text-gray-900'>跟读复习</h1>
            <p className='mt-3 text-sm font-medium text-gray-500'>
              今日待复习 {queue.length} 句。系统会按熟练度自动配置速度、重复和停顿，你只需专注练习。
            </p>
          </div>
          <div className='mt-7 grid gap-3 md:grid-cols-3'>
            <div className='rounded-2xl border border-indigo-200 bg-indigo-50/70 p-3'>
              <p className='text-sm font-black text-indigo-800'>{MODE_GUIDE.context.title}</p>
              <p className='mt-1 text-xs font-medium text-indigo-700'>
                {MODE_GUIDE.context.desc}
              </p>
              <p className='mt-2 text-[11px] font-bold text-indigo-500'>
                适用: {MODE_GUIDE.context.useFor}
              </p>
            </div>
            <div className='rounded-2xl border border-amber-200 bg-amber-50/70 p-3'>
              <p className='text-sm font-black text-amber-800'>{MODE_GUIDE.focus.title}</p>
              <p className='mt-1 text-xs font-medium text-amber-700'>
                {MODE_GUIDE.focus.desc}
              </p>
              <p className='mt-2 text-[11px] font-bold text-amber-500'>
                适用: {MODE_GUIDE.focus.useFor}
              </p>
            </div>
            <div className='rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3'>
              <p className='text-sm font-black text-emerald-800'>{MODE_GUIDE.shadow.title}</p>
              <p className='mt-1 text-xs font-medium text-emerald-700'>
                {MODE_GUIDE.shadow.desc}
              </p>
              <p className='mt-2 text-[11px] font-bold text-emerald-500'>
                适用: {MODE_GUIDE.shadow.useFor}
              </p>
            </div>
          </div>
          <div className='mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-3'>
            <p className='text-xs font-bold text-gray-600'>
              训练模式也会自动选择：新句优先语境，过渡到精听，熟练后进入影子输出。
            </p>
          </div>
          <div className='mt-8 flex justify-center'>
            <button
              onClick={handleStartSession}
              className='inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-md shadow-indigo-100 transition-colors hover:bg-indigo-700'>
              <svg className='h-4 w-4' fill='currentColor' viewBox='0 0 24 24'>
                <path d='M8 5v14l11-7z' />
              </svg>
              开始训练
            </button>
          </div>
        </div>
        {/* 隐藏的 audio 标签，等待被唤醒 */}
        <audio ref={audioRef} playsInline preload='auto' />
      </div>
    )
  }

  // 以下为正式训练 UI
  return (
    <main className='min-h-screen bg-gray-50 p-4 md:p-8 flex flex-col relative'>
      <audio ref={audioRef} playsInline preload='auto' />{' '}
      {/* 加上 playsInline 防止 iOS 自动全屏弹出视频播放器 */}
      <div className='mx-auto mb-3 w-full max-w-4xl'>
        <div className='rounded-xl border border-gray-200 bg-gray-50/80 p-2'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <span className='inline-flex h-8 items-center rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 text-[11px] font-bold text-indigo-700'>
              模式自动: {autoShadowMode === 'context' ? '语境' : autoShadowMode === 'focus' ? '精听' : '影子'}
            </span>
            <div className='flex flex-wrap items-center gap-1.5'>
              <span className='inline-flex h-8 items-center rounded-xl border border-gray-200 bg-white px-2.5 text-[11px] font-bold text-gray-600'>
                智能记忆: {memoryProfile.level === 'new' ? '新词加强' : memoryProfile.level === 'steady' ? '稳态巩固' : '熟词快练'}
              </span>
              <span className='inline-flex h-8 items-center rounded-xl border border-gray-200 bg-white px-2.5 text-[11px] font-bold text-gray-600'>
                速度 {memoryProfile.speed}x
              </span>
              {autoShadowMode !== 'context' ? (
                <span className='inline-flex h-8 items-center rounded-xl border border-gray-200 bg-white px-2.5 text-[11px] font-bold text-gray-600'>
                  重复 {autoShadowMode === 'focus' ? memoryProfile.focusRepeats : memoryProfile.shadowRepeats} · 停顿 {memoryProfile.gapMs}ms
                </span>
              ) : (
                <span className='inline-flex h-8 items-center rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 text-[11px] font-bold text-indigo-700'>
                  语境模式: 固定 1 轮，无停顿
                </span>
              )}
            </div>
            <div className='flex flex-wrap items-center gap-1.5'>
              <button
                type='button'
                onClick={() => void playAudio()}
                className='text-xs font-bold text-gray-700 bg-white hover:bg-gray-100 px-4 py-2 rounded-xl transition-all border border-gray-200'>
                重播
              </button>
              <div className='text-xs font-bold px-4 py-2 rounded-xl bg-indigo-100 text-indigo-700'>
                进度: {currentIndex + 1} / {queue.length}
              </div>
              <InlineConfirmAction
                message='确认把当前句子从复习库移除吗？'
                onConfirm={handleRemove}
                triggerLabel='移除'
                confirmLabel='确认移除'
                pendingLabel='移除中...'
                triggerClassName='text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-4 py-2 rounded-xl transition-all'
              />
            </div>
          </div>
        </div>
      </div>
      <div className='flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto w-full rounded-3xl border border-gray-200 bg-white px-4 py-6 md:px-8 md:py-8 shadow-sm'>
        <div
          onClick={playAudio}
          className='w-full text-center cursor-pointer group mb-10 px-2 relative'>
          <div className='mb-4 flex justify-center'>
            <span className='rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-semibold text-gray-500'>
              {autoShadowMode === 'context'
                ? '模式: 语境连续跟读（单轮）'
                : autoShadowMode === 'focus'
                  ? '模式: 目标句精听精读'
                  : '模式: 先语境后影子跟读'}
            </span>
          </div>
          {/* 🌟 手机端兜底提示：如果真的被严格的系统限制了，亮起黄灯提示用户手动点一下屏幕 */}
          {autoplayFailed ? (
            <div className='mb-4 flex justify-center'>
              <span className='flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700'>
                <svg
                  className='h-4 w-4'
                  fill='currentColor'
                  viewBox='0 0 24 24'>
                  <path d='M8 5v14l11-7z' />
                </svg>{' '}
                请点击屏幕播放原声
              </span>
            </div>
          ) : (
            <div className='mb-4 opacity-0 group-hover:opacity-100 transition-opacity flex justify-center'>
              <span className='flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-500'>
                <svg
                  className='h-3.5 w-3.5'
                  fill='currentColor'
                  viewBox='0 0 24 24'>
                  <path d='M8 5v14l11-7z' />
                </svg>{' '}
                点击重播原声
              </span>
            </div>
          )}

          <div className='flex flex-col gap-6 items-center'>
            {currentItem.context?.prev && (
              <p className='text-lg md:text-xl text-gray-400 font-medium'>
                {currentItem.context.prev}
              </p>
            )}

            <h2
              className={`text-3xl md:text-5xl font-black leading-tight md:leading-snug transition-colors ${autoplayFailed ? 'text-gray-400' : 'text-gray-900'}`}>
              {currentItem.dialogue?.text || '该句子数据缺失'}
            </h2>

            {currentItem.context?.next && (
              <p className='text-lg md:text-xl text-gray-400 font-medium'>
                {currentItem.context.next}
              </p>
            )}
          </div>
        </div>

        <div
          className={`w-full max-w-3xl grid grid-cols-2 md:grid-cols-4 gap-3 transition-opacity duration-300 ${isEvaluating ? 'opacity-50 pointer-events-none' : ''}`}>
          <button
            onClick={() => handleRate(Rating.Again)}
            className='flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-3 py-4 transition-colors hover:bg-rose-100 group'>
            <span className='mb-1 text-base font-bold text-rose-700 group-hover:scale-105 transition-transform'>
              嘴瓢了
            </span>
            <span className='text-[11px] font-medium text-rose-500'>(&lt; 1分钟重练)</span>
          </button>
          <button
            onClick={() => handleRate(Rating.Hard)}
            className='flex flex-col items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-3 py-4 transition-colors hover:bg-amber-100 group'>
            <span className='mb-1 text-base font-bold text-amber-700 group-hover:scale-105 transition-transform'>
              勉强跟上
            </span>
            <span className='text-[11px] font-medium text-amber-500'>(耗脑力/生硬)</span>
          </button>
          <button
            onClick={() => handleRate(Rating.Good)}
            className='flex flex-col items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-4 transition-colors hover:bg-emerald-100 group'>
            <span className='mb-1 text-base font-bold text-emerald-700 group-hover:scale-105 transition-transform'>
              流畅跟读
            </span>
            <span className='text-[11px] font-medium text-emerald-500'>(明天再测)</span>
          </button>
          <button
            onClick={() => handleRate(Rating.Easy)}
            className='flex flex-col items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 px-3 py-4 transition-colors hover:bg-sky-100 group'>
            <span className='mb-1 text-base font-bold text-sky-700 group-hover:scale-105 transition-transform'>
              完美脱口
            </span>
            <span className='text-[11px] font-medium text-sky-500'>(形成肌肉记忆)</span>
          </button>
        </div>
      </div>
    </main>
  )
}
