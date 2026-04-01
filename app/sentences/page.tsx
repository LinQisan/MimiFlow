// app/sentences/page.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  getAllReviewSentences,
  removeSentenceFromReview,
} from '@/app/actions/fsrs'
import { useDialog } from '@/context/DialogContext'

type SentenceItem = {
  id: string
  reps: number
  stability: number
  dialogue?: {
    text: string
    start: number
    end: number
    lesson: {
      title: string
      audioFile: string
    }
  }
}

export default function SentencesManagePage() {
  const dialog = useDialog()
  const [sentences, setSentences] = useState<SentenceItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    async function fetchAll() {
      const data = await getAllReviewSentences()
      setSentences(data || [])
      setIsLoading(false)
    }
    fetchAll()
  }, [])

  const handlePlay = (item: SentenceItem) => {
    const audio = audioRef.current
    if (!audio || !item.dialogue) return
    const dialogue = item.dialogue

    if (playingId === item.id) {
      audio.pause()
      setPlayingId(null)
      return
    }

    audio.src = dialogue.lesson.audioFile
    audio.currentTime = dialogue.start
    audio.play()
    setPlayingId(item.id)

    const handleTimeUpdate = () => {
      if (audio.currentTime >= dialogue.end) {
        audio.pause()
        setPlayingId(null)
        audio.removeEventListener('timeupdate', handleTimeUpdate)
      }
    }
    audio.addEventListener('timeupdate', handleTimeUpdate)
  }

  const executeDelete = async (id: string) => {
    setDeletingId(id)

    const res = await removeSentenceFromReview(id)
    if (res.success) {
      setSentences(prev => prev.filter(s => s.id !== id))
    } else {
      await dialog.alert('移除失败')
    }

    setDeletingId(null)
    setConfirmingId(null)
  }

  // 🌟 将 FSRS 的冰冷数据转化为用户能看懂的“流利度进度”
  const getFluencyLevel = (stability: number) => {
    if (stability < 1)
      return {
        label: '嘴瓢预警',
        color: 'text-orange-600 bg-orange-50',
        barW: 'w-1/4',
        barBg: 'bg-orange-400',
      }
    if (stability < 3)
      return {
        label: '正在强化',
        color: 'text-blue-600 bg-blue-50',
        barW: 'w-2/4',
        barBg: 'bg-blue-400',
      }
    if (stability < 7)
      return {
        label: '逐渐顺口',
        color: 'text-indigo-600 bg-indigo-50',
        barW: 'w-3/4',
        barBg: 'bg-indigo-400',
      }
    return {
      label: '脱口而出',
      color: 'text-green-600 bg-green-50',
      barW: 'w-full',
      barBg: 'bg-green-400',
    }
  }
  return (
    <main className='min-h-screen bg-gray-50 p-4 md:p-8'>
      <audio ref={audioRef} />
      <div className='max-w-4xl mx-auto mt-6'>
        <div className='mb-8 flex justify-between items-end'>
          <div>
            <h1 className='text-3xl font-bold text-gray-800 tracking-tight'>
              🧠 我的智能句库
            </h1>
            <p className='text-gray-500 mt-2'>
              共收录 {sentences.length} 句影子跟读素材
            </p>
          </div>
          <Link
            href='/review'
            className='px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-sm font-medium'>
            开始今日训练
          </Link>
        </div>

        {isLoading ? (
          <div className='text-center py-20 text-gray-400'>加载中...</div>
        ) : sentences.length === 0 ? (
          <div className='text-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm'>
            <span className='text-4xl mb-4 block'>📭</span>
            <h3 className='text-lg font-medium text-gray-700'>句库空空如也</h3>
            <p className='text-gray-400 mt-2'>
              快去听力播放器里添加你想练的句子吧
            </p>
          </div>
        ) : (
          <div className='space-y-4'>
            {sentences.map(item => (
              // 🌟 1. 卡片加上 relative 和 overflow-hidden，防止滑出的按钮溢出卡片
              <div
                key={item.id}
                className='relative bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-start gap-4 hover:shadow-md transition overflow-hidden'>
                <button
                  onClick={() => handlePlay(item)}
                  className={`shrink-0 w-10 h-10 mt-1 flex items-center justify-center rounded-full transition-all ${
                    playingId === item.id
                      ? 'bg-indigo-600 text-white shadow-md ring-4 ring-indigo-500/20'
                      : 'bg-indigo-50 text-indigo-500 hover:bg-indigo-100'
                  }`}>
                  {playingId === item.id ? (
                    <svg
                      className='w-5 h-5'
                      fill='currentColor'
                      viewBox='0 0 24 24'>
                      <path d='M6 19h4V5H6v14zm8-14v14h4V5h-4z' />
                    </svg>
                  ) : (
                    <svg
                      className='w-5 h-5 ml-1'
                      fill='currentColor'
                      viewBox='0 0 24 24'>
                      <path d='M8 5v14l11-7z' />
                    </svg>
                  )}
                </button>

                {/* 🌟 2. 加上 min-w-0 防止 flex 撑破布局 */}
                <div className='flex-1 min-w-0'>
                  <h3 className='text-lg font-medium text-gray-800 leading-relaxed mb-2'>
                    {item.dialogue?.text || '原句内容缺失'}
                  </h3>
                  <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-gray-400'>
                    <div className='truncate max-w-50'>
                      来源: {item.dialogue?.lesson.title || '未知来源'}
                    </div>

                    {/* 右侧：流利度指示器 */}
                    <div className='flex items-center gap-2'>
                      <span
                        title={`已跟读 ${item.reps} 次`}
                        className='text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded'>
                        练过 {item.reps} 次
                      </span>
                      <div className='w-px h-3 bg-gray-200'></div>{' '}
                      {/* 分割线 */}
                      {(() => {
                        const fluency = getFluencyLevel(item.stability)
                        return (
                          <div
                            className='flex items-center gap-1.5 cursor-help'
                            title={`FSRS 算法稳定度: ${item.stability.toFixed(2)}`}>
                            {/* 进度条底槽 */}
                            <div className='w-10 h-1.5 bg-gray-100 rounded-full overflow-hidden'>
                              <div
                                className={`h-full ${fluency.barBg} ${fluency.barW} transition-all duration-500`}></div>
                            </div>
                            {/* 徽章文案 */}
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${fluency.color}`}>
                              {fluency.label}
                            </span>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                </div>

                {/* ========================================================= */}
                {/* 🌟 3. 核心魔法：防抖动的悬浮抽屉式删除按钮 */}
                {/* 锁死父容器的宽度(w-12)，永远不挤压左边的文字 */}
                <div className='relative shrink-0 w-12 h-8 ml-2'>
                  {/* 默认的红色删除按钮 (缩放 + 淡出动画) */}
                  <button
                    onClick={() => setConfirmingId(item.id)}
                    className={`absolute inset-0 w-full h-full text-xs text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-all duration-300 ease-out flex items-center justify-center ${
                      confirmingId === item.id
                        ? 'opacity-0 scale-75 pointer-events-none'
                        : 'opacity-100 scale-100'
                    }`}>
                    删除
                  </button>

                  {/* 展开的确认面板 (从右向左滑入，绝对定位盖在文字上面) */}
                  <div
                    className={`absolute right-0 top-1/2 -translate-y-1/2 flex items-center transition-all duration-400 ease-out z-10 ${
                      confirmingId === item.id
                        ? 'opacity-100 translate-x-0 pointer-events-auto'
                        : 'opacity-0 translate-x-8 pointer-events-none'
                    }`}>
                    {/* 细节魔法：左侧白色的羽化渐变边缘，让覆盖文字时显得极其自然，不会一刀切 */}
                    <div className='w-12 h-12 bg-linear-to-r from-transparent to-white pointer-events-none'></div>

                    {/* 按钮实心区域 */}
                    <div className='flex items-center gap-2 bg-white py-2 pl-1 pr-1'>
                      <button
                        onClick={() => setConfirmingId(null)}
                        disabled={deletingId === item.id}
                        className='text-xs text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition font-medium whitespace-nowrap shrink-0'>
                        取消
                      </button>
                      <button
                        onClick={() => executeDelete(item.id)}
                        disabled={deletingId === item.id}
                        className='text-xs text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg transition shadow-sm disabled:opacity-50 font-medium whitespace-nowrap shrink-0 flex items-center gap-1'>
                        {/* 菊花转 Loading 动画 */}
                        {deletingId === item.id && (
                          <svg
                            className='animate-spin h-3 w-3 text-white'
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
                        )}
                        {deletingId === item.id ? '移除中' : '确定移除'}
                      </button>
                    </div>
                  </div>
                </div>
                {/* ========================================================= */}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
