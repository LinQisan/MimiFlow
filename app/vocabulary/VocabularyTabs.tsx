// app/vocabulary/VocabularyTabs.tsx
'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { getMoreExamples } from '@/app/actions/search'

const LANG_MAP: Record<string, { name: string; emoji: string }> = {
  jp: { name: '日语', emoji: '🇯🇵' },
  en: { name: '英语', emoji: '🇺🇸' },
}

type VocabItem = {
  id: string
  word: string
  sentence: string
  source: string
  lessonId: string
  createdAt: Date
  dialogueId: number
  start: number
  end: number
  audioFile: string
}

export default function VocabularyTabs({
  groupedData,
}: {
  groupedData: Record<string, VocabItem[]>
}) {
  const availableLangs = Object.keys(groupedData)
  const [activeLang, setActiveLang] = useState(availableLangs[0] || '')

  const audioRef = useRef<HTMLAudioElement>(null)

  // 🌟 状态优化：用 uniqueId 来记录当前正在播放的句子，防止错乱
  const [playingId, setPlayingId] = useState<string | null>(null)

  // 🌟 状态优化：确保完全依靠数据库的绝对唯一 ID (vocab.id) 来控制展开
  const [expandedExamples, setExpandedExamples] = useState<
    Record<string, any[]>
  >({})
  const [loadingExamples, setLoadingExamples] = useState<
    Record<string, boolean>
  >({})

  // 🎵 升级版：通用的音频播放逻辑
  const handlePlayAudio = (
    audioFile: string,
    start: number,
    end: number,
    uniquePlayId: string,
  ) => {
    const audio = audioRef.current
    if (!audio) return

    // 如果点击的是正在播放的句子，就暂停
    if (playingId === uniquePlayId) {
      audio.pause()
      setPlayingId(null)
      return
    }

    // 播放新的句子
    audio.src = audioFile
    audio.currentTime = start
    audio.play()
    setPlayingId(uniquePlayId)

    const handleTimeUpdate = () => {
      if (audio.currentTime >= end) {
        audio.pause()
        setPlayingId(null)
        audio.removeEventListener('timeupdate', handleTimeUpdate)
      }
    }
    audio.addEventListener('timeupdate', handleTimeUpdate)
  }

  const handleFetchMore = async (item: VocabItem) => {
    if (expandedExamples[item.id]) {
      const newExp = { ...expandedExamples }
      delete newExp[item.id]
      setExpandedExamples(newExp)
      return
    }

    setLoadingExamples(prev => ({ ...prev, [item.id]: true }))
    const res = await getMoreExamples(item.word, item.dialogueId)
    setLoadingExamples(prev => ({ ...prev, [item.id]: false }))

    if (res.success && res.data) {
      setExpandedExamples(prev => ({ ...prev, [item.id]: res.data }))
    } else {
      alert('查询例句失败！')
    }
  }

  const renderHighlightedSentence = (sentence: string, targetWord: string) => {
    const parts = sentence.split(new RegExp(`(${targetWord})`, 'gi'))
    return (
      <span className='text-gray-700 leading-relaxed text-lg'>
        {parts.map((part, i) =>
          part.toLowerCase() === targetWord.toLowerCase() ? (
            <mark
              key={i}
              className='bg-yellow-200 text-gray-900 px-1 rounded shadow-sm'>
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </span>
    )
  }

  if (availableLangs.length === 0) {
    return (
      <div className='text-center py-20 bg-white rounded-2xl shadow-sm border border-gray-100'>
        <span className='text-4xl mb-4 block'>📭</span>
        <h3 className='text-lg font-medium text-gray-700'>生词本空空如也</h3>
        <p className='text-gray-400 mt-2'>快去听力播放器里划词收藏吧！</p>
      </div>
    )
  }

  const currentWords = groupedData[activeLang] || []

  return (
    <div>
      <audio ref={audioRef} />

      <div className='flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide'>
        {availableLangs.map(lang => {
          const info = LANG_MAP[lang] || {
            name: lang.toUpperCase(),
            emoji: '🌐',
          }
          const isActive = activeLang === lang
          return (
            <button
              key={lang}
              onClick={() => setActiveLang(lang)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}>
              <span>{info.emoji}</span> <span>{info.name}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${isActive ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {groupedData[lang].length}
              </span>
            </button>
          )
        })}
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6'>
        {currentWords.map(item => {
          // 为主例句生成唯一的播放 ID
          const mainPlayId = `main-${item.id}`
          const isMainPlaying = playingId === mainPlayId

          return (
            <div
              key={item.id}
              className='bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col transition-all'>
              <div className='flex justify-between items-start mb-3'>
                <h2 className='text-2xl font-bold text-gray-900'>
                  {item.word}
                </h2>
              </div>

              {/* 🌟 核心改造：主例句展示区，播放按钮移到了句子的左侧 */}
              <div className='bg-gray-50 p-4 rounded-xl border border-gray-100 mb-3 flex items-start gap-3 transition-colors hover:bg-indigo-50/30'>
                <button
                  onClick={() =>
                    handlePlayAudio(
                      item.audioFile,
                      item.start,
                      item.end,
                      mainPlayId,
                    )
                  }
                  className={`shrink-0 w-8 h-8 mt-1 flex items-center justify-center rounded-full transition-all ${
                    isMainPlaying
                      ? 'bg-indigo-600 text-white shadow-md scale-110'
                      : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
                  }`}
                  title='播放此句原声'>
                  {isMainPlaying ? (
                    <svg
                      className='w-4 h-4'
                      fill='currentColor'
                      viewBox='0 0 24 24'>
                      <path d='M6 19h4V5H6v14zm8-14v14h4V5h-4z' />
                    </svg>
                  ) : (
                    <svg
                      className='w-4 h-4 ml-0.5'
                      fill='currentColor'
                      viewBox='0 0 24 24'>
                      <path d='M8 5v14l11-7z' />
                    </svg>
                  )}
                </button>
                <div className='flex-1'>
                  {renderHighlightedSentence(item.sentence, item.word)}
                </div>
              </div>

              <div className='flex justify-between items-center mt-2 pt-3 border-t border-gray-100'>
                <Link
                  href={`/lesson/${item.lessonId}`}
                  className='text-xs text-gray-500 hover:text-indigo-600 flex items-center gap-1 truncate max-w-[50%]'>
                  🔗 {item.source}
                </Link>

                <button
                  onClick={() => handleFetchMore(item)}
                  disabled={loadingExamples[item.id]}
                  className='text-xs font-medium text-indigo-500 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors'>
                  {loadingExamples[item.id]
                    ? '查询中...'
                    : expandedExamples[item.id]
                      ? '收起例句'
                      : '🔍 更多例句'}
                </button>
              </div>

              {/* 🌟 核心改造：展开的更多例句面板，每个例句都有独立的播放按钮 */}
              {expandedExamples[item.id] && (
                <div className='mt-4 space-y-2 border-t border-dashed border-gray-200 pt-3 animate-fade-in'>
                  {expandedExamples[item.id].length === 0 ? (
                    <p className='text-sm text-gray-400 text-center py-2'>
                      没有找到更多包含该词的例句啦
                    </p>
                  ) : (
                    expandedExamples[item.id].map((ex: any) => {
                      // 为每个查询出来的例句生成唯一的播放 ID
                      const exPlayId = `ex-${ex.id}`
                      const isExPlaying = playingId === exPlayId

                      return (
                        <div
                          key={ex.id}
                          className='text-sm bg-indigo-50/50 p-3 rounded-lg flex items-start gap-3 hover:bg-indigo-50 transition-colors'>
                          <button
                            onClick={() =>
                              handlePlayAudio(
                                ex.lesson.audioFile,
                                ex.start,
                                ex.end,
                                exPlayId,
                              )
                            }
                            className={`shrink-0 w-7 h-7 mt-0.5 flex items-center justify-center rounded-full transition-all ${
                              isExPlaying
                                ? 'bg-indigo-600 text-white shadow-md scale-110'
                                : 'bg-white border border-indigo-200 text-indigo-500 hover:bg-indigo-100'
                            }`}
                            title='播放例句原声'>
                            {isExPlaying ? (
                              <svg
                                className='w-3 h-3'
                                fill='currentColor'
                                viewBox='0 0 24 24'>
                                <path d='M6 19h4V5H6v14zm8-14v14h4V5h-4z' />
                              </svg>
                            ) : (
                              <svg
                                className='w-3 h-3 ml-0.5'
                                fill='currentColor'
                                viewBox='0 0 24 24'>
                                <path d='M8 5v14l11-7z' />
                              </svg>
                            )}
                          </button>

                          <div className='flex-1 flex flex-col gap-1'>
                            {renderHighlightedSentence(ex.text, item.word)}
                            <span className='text-[10px] text-gray-400 self-end'>
                              {ex.lesson.category.level.title} -{' '}
                              {ex.lesson.title}
                            </span>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
