// app/review/page.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Rating } from 'ts-fsrs'
import {
  getDueSentences,
  rateSentenceFluency,
  removeSentenceFromReview,
} from '@/app/actions/fsrs'

export default function ReviewPage() {
  const [queue, setQueue] = useState<any[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isEvaluating, setIsEvaluating] = useState(false)

  // 🌟 新增 1：用于解锁手机音频的会话状态
  const [sessionStarted, setSessionStarted] = useState(false)
  const [autoplayFailed, setAutoplayFailed] = useState(false) // 兜底：如果解锁失败，显示手动播放提示

  const audioRef = useRef<HTMLAudioElement>(null)

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

  const playAudio = async () => {
    if (!audioRef.current || !currentItem) return
    const audio = audioRef.current

    const targetSrc = currentItem.dialogue.lesson.audioFile
    const start = currentItem.context.playStart
    const end = currentItem.context.playEnd

    if (!audio.src.includes(targetSrc)) {
      audio.src = targetSrc
    }

    audio.currentTime = start

    // 🌟 核心捕获机制
    try {
      await audio.play()
      setAutoplayFailed(false) // 播放成功，隐藏提示
    } catch (error: any) {
      console.warn('播放被浏览器拦截:', error)
      // 如果报错是 NotAllowedError，说明手机浏览器依然不给面子
      if (error.name === 'NotAllowedError') {
        setAutoplayFailed(true)
      }
      return
    }

    const handleTimeUpdate = () => {
      if (audio.currentTime >= end) {
        audio.pause()
        audio.removeEventListener('timeupdate', handleTimeUpdate)
      }
    }
    audio.removeEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('timeupdate', handleTimeUpdate)
  }

  // 🌟 新增 2：用户首次点击，解锁音频引擎
  const handleStartSession = () => {
    setSessionStarted(true)
    playAudio() // 直接在点击事件中调用，100% 能解锁手机浏览器！
  }

  useEffect(() => {
    let timer: NodeJS.Timeout
    // 🌟 只有当用户点击了开始，且有题目时，才允许自动播放下一题
    if (currentItem && sessionStarted) {
      timer = setTimeout(playAudio, 300)
    }
    return () => clearTimeout(timer)
  }, [currentItem, sessionStarted])

  const handleRate = async (rating: Rating) => {
    if (isEvaluating) return
    setIsEvaluating(true)

    const res = await rateSentenceFluency(currentItem.id, rating)
    if (res.success) {
      setTimeout(() => {
        setCurrentIndex(prev => prev + 1)
        setIsEvaluating(false)
      }, 300)
    } else {
      alert('打分提交失败')
      setIsEvaluating(false)
    }
  }

  const handleRemove = async () => {
    if (!confirm('确定要把这句话从复习库中移除吗？')) return
    setIsEvaluating(true)
    const res = await removeSentenceFromReview(currentItem.id)
    if (res.success) {
      setCurrentIndex(prev => prev + 1)
    } else {
      alert('移除失败')
    }
    setIsEvaluating(false)
  }

  if (isLoading)
    return (
      <div className='text-center mt-32 text-gray-500'>
        正在组装今日训练包...
      </div>
    )

  if (currentIndex >= queue.length) {
    return (
      <div className='min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4'>
        <span className='text-6xl mb-6'>🎉</span>
        <h1 className='text-2xl font-bold text-gray-800 mb-2'>
          太棒了！今日跟读任务清零
        </h1>
        <p className='text-gray-500 mb-8'>
          你的口腔肌肉已经形成了新的记忆痕迹。
        </p>
        <Link
          href='/'
          className='px-6 py-3 bg-indigo-600 text-white rounded-full font-medium hover:bg-indigo-700 transition shadow-lg'>
          返回控制台
        </Link>
      </div>
    )
  }

  // 🌟 新增 3：未开始状态下的“启动大门” UI
  if (!sessionStarted) {
    return (
      <div className='min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4'>
        <div className='text-center mb-10'>
          <span className='text-6xl block mb-6'>🎙️</span>
          <h1 className='text-3xl font-bold text-white mb-2'>
            准备好跟读了吗？
          </h1>
          <p className='text-gray-400'>今日共有 {queue.length} 句待复习</p>
        </div>
        <button
          onClick={handleStartSession}
          className='px-8 py-4 bg-indigo-600 text-white text-lg rounded-full font-bold hover:bg-indigo-500 transition shadow-[0_0_20px_rgba(79,70,229,0.4)] flex items-center gap-2 transform hover:scale-105'>
          <svg className='w-6 h-6' fill='currentColor' viewBox='0 0 24 24'>
            <path d='M8 5v14l11-7z' />
          </svg>
          点击开始训练
        </button>
        <Link href='/' className='mt-8 text-gray-500 hover:text-gray-300'>
          稍后再练
        </Link>
        {/* 隐藏的 audio 标签，等待被唤醒 */}
        <audio ref={audioRef} playsInline />
      </div>
    )
  }

  // 以下为正式训练 UI
  return (
    <main className='min-h-screen bg-gray-900 text-white p-4 md:p-8 flex flex-col relative'>
      <audio ref={audioRef} playsInline />{' '}
      {/* 加上 playsInline 防止 iOS 自动全屏弹出视频播放器 */}
      <div className='max-w-4xl mx-auto w-full flex justify-between items-center mb-8'>
        <Link
          href='/'
          className='text-gray-400 hover:text-white transition-colors'>
          &larr; 退出训练
        </Link>
        <div className='flex items-center gap-4'>
          <div className='text-sm font-medium bg-gray-800 px-4 py-1.5 rounded-full text-indigo-300'>
            进度: {currentIndex + 1} / {queue.length}
          </div>
          <button
            onClick={handleRemove}
            className='text-gray-400 hover:text-red-400 p-2 transition-colors'
            title='从复习库中彻底删除'>
            <svg
              className='w-5 h-5'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16'
              />
            </svg>
          </button>
        </div>
      </div>
      <div className='flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto w-full'>
        <div
          onClick={playAudio}
          className='w-full text-center cursor-pointer group mb-16 px-4 relative'>
          {/* 🌟 手机端兜底提示：如果真的被严格的系统限制了，亮起黄灯提示用户手动点一下屏幕 */}
          {autoplayFailed ? (
            <div className='mb-6 flex justify-center animate-bounce'>
              <span className='bg-yellow-500/20 border border-yellow-500 text-xs px-4 py-2 rounded-full text-yellow-300 flex items-center gap-2'>
                <svg
                  className='w-5 h-5'
                  fill='currentColor'
                  viewBox='0 0 24 24'>
                  <path d='M8 5v14l11-7z' />
                </svg>{' '}
                请点击屏幕播放原声
              </span>
            </div>
          ) : (
            <div className='mb-6 opacity-0 group-hover:opacity-100 transition-opacity flex justify-center'>
              <span className='bg-gray-700 text-xs px-3 py-1 rounded-full text-gray-300 flex items-center gap-1'>
                <svg
                  className='w-4 h-4'
                  fill='currentColor'
                  viewBox='0 0 24 24'>
                  <path d='M8 5v14l11-7z' />
                </svg>{' '}
                点击重播原声
              </span>
            </div>
          )}

          <div className='flex flex-col gap-6 items-center'>
            {currentItem.context.prev && (
              <p className='text-xl md:text-2xl text-gray-500 font-medium opacity-60'>
                {currentItem.context.prev}
              </p>
            )}

            <h2
              className={`text-3xl md:text-5xl font-bold leading-tight md:leading-snug drop-shadow-md transition-colors ${autoplayFailed ? 'text-gray-400' : 'text-indigo-100'}`}>
              {currentItem.dialogue.text}
            </h2>

            {currentItem.context.next && (
              <p className='text-xl md:text-2xl text-gray-500 font-medium opacity-60'>
                {currentItem.context.next}
              </p>
            )}
          </div>
        </div>

        <div
          className={`w-full max-w-2xl grid grid-cols-2 md:grid-cols-4 gap-3 transition-opacity duration-300 ${isEvaluating ? 'opacity-50 pointer-events-none' : ''}`}>
          <button
            onClick={() => handleRate(Rating.Again)}
            className='flex flex-col items-center justify-center p-4 rounded-2xl bg-gray-800 border-2 border-gray-700 hover:border-red-500 hover:bg-red-500/10 transition-colors group'>
            <span className='text-red-400 font-bold text-lg mb-1 group-hover:scale-110 transition-transform'>
              嘴瓢了
            </span>
            <span className='text-xs text-gray-500'>(&lt; 1分钟重练)</span>
          </button>
          <button
            onClick={() => handleRate(Rating.Hard)}
            className='flex flex-col items-center justify-center p-4 rounded-2xl bg-gray-800 border-2 border-gray-700 hover:border-orange-500 hover:bg-orange-500/10 transition-colors group'>
            <span className='text-orange-400 font-bold text-lg mb-1 group-hover:scale-110 transition-transform'>
              勉强跟上
            </span>
            <span className='text-xs text-gray-500'>(耗脑力/生硬)</span>
          </button>
          <button
            onClick={() => handleRate(Rating.Good)}
            className='flex flex-col items-center justify-center p-4 rounded-2xl bg-gray-800 border-2 border-gray-700 hover:border-green-500 hover:bg-green-500/10 transition-colors group'>
            <span className='text-green-400 font-bold text-lg mb-1 group-hover:scale-110 transition-transform'>
              流畅跟读
            </span>
            <span className='text-xs text-gray-500'>(明天再测)</span>
          </button>
          <button
            onClick={() => handleRate(Rating.Easy)}
            className='flex flex-col items-center justify-center p-4 rounded-2xl bg-gray-800 border-2 border-gray-700 hover:border-blue-500 hover:bg-blue-500/10 transition-colors group'>
            <span className='text-blue-400 font-bold text-lg mb-1 group-hover:scale-110 transition-transform'>
              完美脱口
            </span>
            <span className='text-xs text-gray-500'>(形成肌肉记忆)</span>
          </button>
        </div>
      </div>
    </main>
  )
}
