// app/sentences/page.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  getAllReviewSentences,
  removeSentenceFromReview,
} from '@/app/actions/fsrs'
import { useDialog } from '@/context/DialogContext'
import InlineConfirmAction from '@/components/InlineConfirmAction'

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
    <main className='min-h-screen bg-gray-50 p-3 md:p-8'>
      <audio ref={audioRef} />
      <div className='mx-auto mt-2 w-full max-w-5xl md:mt-6'>
        <div className='mb-5 border-b border-gray-200 pb-4 md:mb-8 md:pb-6'>
          <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
          <div>
            <h1 className='text-2xl font-semibold text-gray-800 tracking-tight md:text-3xl'>
              句库管理
            </h1>
            <p className='mt-2 text-sm text-gray-500 md:text-base'>
              已收录 {sentences.length} 条跟读训练句，可直接进入复习训练
            </p>
          </div>
          <Link
            href='/review'
              className='ui-btn ui-btn-primary w-full md:w-auto'>
            进入复习训练
          </Link>
        </div>
        </div>

        {isLoading ? (
          <div className='text-center py-20 text-gray-400'>加载中...</div>
        ) : sentences.length === 0 ? (
          <div className='text-center py-20 border-b border-dashed border-gray-300'>
            <span className='text-4xl mb-4 block'>📭</span>
            <h3 className='text-lg font-medium text-gray-700'>句库暂无训练句</h3>
            <p className='text-gray-400 mt-2'>
              请先在听力页面添加句子到句库
            </p>
          </div>
        ) : (
          <div className='space-y-3 md:space-y-4'>
            {sentences.map(item => (
              <div
                key={item.id}
                className='border-b border-gray-200 px-1 py-4 transition-colors hover:bg-gray-50 md:py-5'>
                <div className='flex items-start gap-3 md:gap-4'>
                <button
                  onClick={() => handlePlay(item)}
                  className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center border border-gray-200 transition-all ${
                    playingId === item.id
                      ? 'bg-indigo-600 text-white'
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

                <div className='flex-1 min-w-0'>
                    <h3 className='mb-2 text-[17px] font-medium leading-relaxed text-gray-800 md:text-lg'>
                    {item.dialogue?.text || '原句内容缺失'}
                  </h3>
                    <div className='flex flex-col gap-2 text-xs text-gray-400 sm:flex-row sm:items-center sm:justify-between'>
                      <div className='truncate'>
                      来源: {item.dialogue?.lesson.title || '未知来源'}
                    </div>

                      <div className='flex flex-wrap items-center gap-2'>
                      <span
                        title={`已跟读 ${item.reps} 次`}
                        className='text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded'>
                        练过 {item.reps} 次
                      </span>
                        <div className='h-3 w-px bg-gray-200'></div>
                      {(() => {
                        const fluency = getFluencyLevel(item.stability)
                        return (
                          <div
                            className='flex items-center gap-1.5 cursor-help'
                            title={`FSRS 算法稳定度: ${item.stability.toFixed(2)}`}>
                            <div className='w-10 h-1.5 bg-gray-100 overflow-hidden'>
                              <div
                                className={`h-full ${fluency.barBg} ${fluency.barW} transition-all duration-500`}></div>
                            </div>
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
                </div>

                <div className='mt-3 flex justify-end'>
                  <InlineConfirmAction
                    message='确认将该句子移出句库吗？'
                    onConfirm={() => executeDelete(item.id)}
                    triggerLabel='移除'
                    pendingLabel={deletingId === item.id ? '移除中...' : '处理中...'}
                    confirmLabel='确认移除'
                    triggerClassName='ui-btn ui-btn-sm ui-btn-danger'
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
