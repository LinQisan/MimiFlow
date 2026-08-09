'use client'

import { useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'

import CollectionBrowserSelect, {
  type CollectionBrowserOption,
} from '@/components/manage/import/CollectionBrowserSelect'
import { toCollectionBrowserOptions } from '@/components/manage/import/collectionBrowserOptions'

import {
  clampTime,
  clampViewStart,
  formatTimingTime as formatTime,
} from '@/features/import/domain/audio-timing'
import type {
  UploadCollectionLite,
} from '@/features/import/domain/audio-timing'
import {
  WaveformCanvas,
  WaveformOverview,
} from '@/features/import/ui/AudioTimingWaveforms'
import { useAudioTimingStudioState } from '@/features/import/hooks/useAudioTimingStudioState'
import { useAudioTimingMutations } from '@/features/import/hooks/useUploadMutations'
export default function AudioTimingStudio({
  collections,
}: {
  collections: UploadCollectionLite[]
}) {
  const studioRef = useRef<HTMLElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const { createShadowingFromTimedAudio } = useAudioTimingMutations()
  const {
    collectionMode,
    setCollectionMode,
    collectionId,
    setCollectionId,
    collectionName,
    setCollectionName,
    audioFile,
    setAudioFile,
    audioUrl,
    setAudioUrl,
    peaks,
    setPeaks,
    duration,
    setDuration,
    currentTime,
    setCurrentTime,
    pendingStart,
    setPendingStart,
    draftText,
    setDraftText,
    manualStart,
    setManualStart,
    manualEnd,
    setManualEnd,
    lines,
    setLines,
    title,
    setTitle,
    chapterName,
    setChapterName,
    description,
    setDescription,
    source,
    setSource,
    language,
    setLanguage,
    difficulty,
    setDifficulty,
    tags,
    setTags,
    status,
    setStatus,
    isDecoding,
    setIsDecoding,
    windowSeconds,
    setWindowSeconds,
    viewStart,
    setViewStart,
    followPlayhead,
    setFollowPlayhead,
    waveformClickMode,
    setWaveformClickMode,
  } = useAudioTimingStudioState(collections)
  const visibleEnd = Math.min(duration, viewStart + windowSeconds)
  const draftStartSeconds = Number(manualStart)
  const draftEndSeconds = Number(manualEnd)

  const collectionOptions: CollectionBrowserOption[] = useMemo(
    () => toCollectionBrowserOptions(collections),
    [collections],
  )

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      if (!audioRef.current || !audioUrl) return

      const target = event.target as HTMLElement | null
      if (!target || !studioRef.current?.contains(target)) return
      const tagName = target.tagName.toLowerCase()
      const isTypingTarget =
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        target.isContentEditable
      if (isTypingTarget) return

      event.preventDefault()
      if (audioRef.current.paused) {
        void audioRef.current.play()
      } else {
        audioRef.current.pause()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [audioUrl])

  const decodeAudio = async (file: File) => {
    setIsDecoding(true)
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as Window & typeof globalThis & {
          webkitAudioContext?: typeof AudioContext
        }).webkitAudioContext
      if (!AudioContextClass) throw new Error('当前浏览器不支持音频解码。')

      const context = new AudioContextClass()
      const buffer = await context.decodeAudioData(await file.arrayBuffer())
      const channel = buffer.getChannelData(0)
      const bucketCount = 900
      const samplesPerBucket = Math.max(1, Math.floor(channel.length / bucketCount))
      const nextPeaks: number[] = []

      for (let i = 0; i < bucketCount; i += 1) {
        const start = i * samplesPerBucket
        const end = Math.min(channel.length, start + samplesPerBucket)
        let max = 0
        for (let j = start; j < end; j += 1) {
          max = Math.max(max, Math.abs(channel[j] || 0))
        }
        nextPeaks.push(max)
      }

      await context.close()
      setDuration(buffer.duration)
      setManualEnd(Math.min(2, buffer.duration).toFixed(2))
      setPeaks(nextPeaks)
      setViewStart(0)
      setFollowPlayhead(true)
    } finally {
      setIsDecoding(false)
    }
  }

  const handleAudioChange = async (file: File | null) => {
    setStatus({ type: 'idle', message: '' })
    setAudioFile(file)
    setLines([])
    setPendingStart(null)
    setCurrentTime(0)
    setPeaks([])
    setDuration(0)
    setViewStart(0)

    if (!file) {
      setAudioUrl('')
      return
    }

    if (audioUrl) URL.revokeObjectURL(audioUrl)
    const nextUrl = URL.createObjectURL(file)
    setAudioUrl(nextUrl)
    if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ''))

    try {
      await decodeAudio(file)
    } catch (error) {
      const message = error instanceof Error ? error.message : '音频解析失败。'
      setStatus({ type: 'error', message })
    }
  }

  const seekTo = (time: number) => {
    const next = clampTime(time, duration)
    setCurrentTime(next)
    setManualStart(next.toFixed(2))
    setFollowPlayhead(true)
    setViewStart(prev => {
      if (!duration) return prev
      if (next < prev || next > prev + windowSeconds) {
        return clampViewStart(next - windowSeconds * 0.35, duration, windowSeconds)
      }
      return prev
    })
    if (audioRef.current) audioRef.current.currentTime = next
  }

  useEffect(() => {
    if (!duration || !followPlayhead) return
    if (currentTime < viewStart || currentTime > visibleEnd) {
      setViewStart(
        clampViewStart(currentTime - windowSeconds * 0.35, duration, windowSeconds),
      )
    }
  }, [
    currentTime,
    duration,
    followPlayhead,
    setViewStart,
    viewStart,
    visibleEnd,
    windowSeconds,
  ])

  useEffect(() => {
    setViewStart(prev => clampViewStart(prev, duration, windowSeconds))
  }, [duration, setViewStart, windowSeconds])

  const shiftView = (offset: number) => {
    setFollowPlayhead(false)
    setViewStart(prev => clampViewStart(prev + offset, duration, windowSeconds))
  }

  const setZoomWindow = (nextWindowSeconds: number) => {
    const next = Math.max(5, Math.min(90, nextWindowSeconds))
    setWindowSeconds(next)
    setViewStart(clampViewStart(currentTime - next * 0.35, duration, next))
    setFollowPlayhead(true)
  }

  const updateDraftRange = (start: number, end: number) => {
    const safeStart = clampTime(start, duration)
    const safeEnd = clampTime(end, duration)
    if (safeEnd <= safeStart) return
    setManualStart(safeStart.toFixed(2))
    setManualEnd(safeEnd.toFixed(2))
  }

  const addLine = (start: number, end: number, text: string) => {
    const cleanText = text.trim()
    const safeStart = clampTime(start, duration)
    const safeEnd = clampTime(end, duration)
    if (!cleanText || safeEnd <= safeStart) return false

    setLines(prev =>
      [
        ...prev,
        {
          id: crypto.randomUUID(),
          text: cleanText,
          start: Number(safeStart.toFixed(2)),
          end: Number(safeEnd.toFixed(2)),
        },
      ].sort((a, b) => a.start - b.start || a.end - b.end),
    )
    setDraftText('')
    setManualStart(safeEnd.toFixed(2))
    setManualEnd(Math.min(duration || safeEnd + 2, safeEnd + 2).toFixed(2))
    return true
  }

  const handleMarkStart = () => {
    const time = audioRef.current?.currentTime ?? currentTime
    setPendingStart(time)
    setManualStart(time.toFixed(2))
  }

  const handleMarkEnd = () => {
    const end = audioRef.current?.currentTime ?? currentTime
    const start = pendingStart ?? Number(manualStart)
    if (addLine(start, end, draftText)) {
      setPendingStart(null)
    } else {
      setStatus({
        type: 'error',
        message: '请填写字幕文本，并确保结束时间晚于开始时间。',
      })
    }
  }

  const handleManualAdd = () => {
    if (!addLine(Number(manualStart), Number(manualEnd), draftText)) {
      setStatus({
        type: 'error',
        message: '请填写字幕文本，并检查开始/结束时间。',
      })
    }
  }

  const handleSubmit = async () => {
    if (!audioFile) {
      setStatus({ type: 'error', message: '请先上传音频。' })
      return
    }
    if (!title.trim()) {
      setStatus({ type: 'error', message: '请填写标题。' })
      return
    }
    if (collectionMode === 'existing' && !collectionId) {
      setStatus({ type: 'error', message: '请选择目标集合。' })
      return
    }
    if (collectionMode === 'new' && !collectionName.trim()) {
      setStatus({ type: 'error', message: '请填写新集合名称。' })
      return
    }
    if (lines.length === 0) {
      setStatus({ type: 'error', message: '请至少添加一条字幕。' })
      return
    }

    setStatus({ type: 'loading', message: '正在上传音频并创建跟读材料...' })
    const formData = new FormData()
    formData.set('collectionMode', collectionMode)
    formData.set('collectionId', collectionId)
    formData.set('collectionName', collectionName)
    formData.set('title', title)
    formData.set('chapterName', chapterName)
    formData.set('description', description)
    formData.set('source', source)
    formData.set('language', language)
    formData.set('difficulty', difficulty)
    formData.set('tags', tags)
    formData.set('subtitleLines', JSON.stringify(lines))
    formData.set('audioFile', audioFile)

    const result = await createShadowingFromTimedAudio(formData)
    setStatus({
      type: result.success ? 'success' : 'error',
      message: result.message,
      lessonId: result.success ? result.lessonId : undefined,
    })
  }

  return (
    <section
      ref={studioRef}
      tabIndex={-1}
      className='mx-auto flex w-full max-w-6xl flex-col gap-5 pb-16'>
      <div className='grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]'>
        <div className='border border-slate-200 bg-white p-4 shadow-sm md:p-6'>
          <div className='mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
            <div>
              <h2 className='text-lg font-black text-slate-900'>音频波形打轴</h2>
              <p className='mt-1 text-sm leading-6 text-slate-500'>
                上传音频后点击波形定位，播放时标记起点和终点即可生成字幕切片。
              </p>
            </div>
            <label className='inline-flex cursor-pointer items-center justify-center border border-slate-300 bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-700'>
              选择音频
              <input
                type='file'
                accept='audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac,.webm'
                className='hidden'
                onChange={event =>
                  void handleAudioChange(event.currentTarget.files?.[0] || null)
                }
              />
            </label>
          </div>

          {audioUrl ? (
            <div className='space-y-4'>
              <audio
                ref={audioRef}
                src={audioUrl}
                controls
                className='w-full'
                onLoadedMetadata={event => {
                  setDuration(event.currentTarget.duration || duration)
                }}
                onTimeUpdate={event => {
                  setCurrentTime(event.currentTarget.currentTime)
                }}
              />
              <div className='flex flex-col gap-3 border border-slate-200 bg-slate-50 p-3 md:flex-row md:items-center md:justify-between'>
                <div className='flex flex-wrap items-center gap-2'>
                  {[8, 15, 30, 60].map(value => (
                    <button
                      key={value}
                      type='button'
                      onClick={() => setZoomWindow(value)}
                      className={`border px-3 py-1.5 text-xs font-black transition ${
                        windowSeconds === value
                          ? 'border-blue-200 bg-blue-600 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                      }`}>
                      {value}s
                    </button>
                  ))}
                </div>
                <div className='flex items-center gap-2'>
                  <button
                    type='button'
                    onClick={() => setWaveformClickMode('start')}
                    className={`border px-3 py-1.5 text-xs font-black hover:bg-slate-100 ${
                      waveformClickMode === 'start'
                        ? 'border-orange-200 bg-orange-50 text-orange-700'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}>
                    波形设起点
                  </button>
                  <button
                    type='button'
                    onClick={() => setWaveformClickMode('end')}
                    className={`border px-3 py-1.5 text-xs font-black hover:bg-slate-100 ${
                      waveformClickMode === 'end'
                        ? 'border-orange-200 bg-orange-50 text-orange-700'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}>
                    波形设终点
                  </button>
                  <button
                    type='button'
                    onClick={() => shiftView(-windowSeconds * 0.8)}
                    className='border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-100'>
                    前一屏
                  </button>
                  <button
                    type='button'
                    onClick={() => {
                      setFollowPlayhead(true)
                      setViewStart(
                        clampViewStart(
                          currentTime - windowSeconds * 0.35,
                          duration,
                          windowSeconds,
                        ),
                      )
                    }}
                    className={`border px-3 py-1.5 text-xs font-black hover:bg-slate-100 ${
                      followPlayhead
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}>
                    跟随播放头
                  </button>
                  <button
                    type='button'
                    onClick={() => shiftView(windowSeconds * 0.8)}
                    className='border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-100'>
                    后一屏
                  </button>
                </div>
              </div>
              <WaveformCanvas
                peaks={peaks}
                duration={duration}
                currentTime={currentTime}
                lines={lines}
                pendingStart={pendingStart}
                draftStart={
                  Number.isFinite(draftStartSeconds) ? draftStartSeconds : 0
                }
                draftEnd={
                  Number.isFinite(draftEndSeconds)
                    ? draftEndSeconds
                    : Math.min(2, duration)
                }
                clickMode={waveformClickMode}
                viewStart={viewStart}
                windowSeconds={windowSeconds}
                onSeek={seekTo}
                onDraftRangeChange={updateDraftRange}
                onClickModeChange={setWaveformClickMode}
              />
              <div className='space-y-2'>
                <input
                  type='range'
                  min='0'
                  max={Math.max(0, duration - windowSeconds)}
                  step='0.05'
                  value={viewStart}
                  onChange={event => {
                    setFollowPlayhead(false)
                    setViewStart(
                      clampViewStart(
                        Number(event.currentTarget.value),
                        duration,
                        windowSeconds,
                      ),
                    )
                  }}
                  className='w-full accent-blue-600'
                  aria-label='移动当前波形窗口'
                />
                <WaveformOverview
                  peaks={peaks}
                  duration={duration}
                  currentTime={currentTime}
                  viewStart={viewStart}
                  windowSeconds={windowSeconds}
                  lines={lines}
                  onSeek={seekTo}
                />
              </div>
              <div className='flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500'>
                <span>当前 {formatTime(currentTime)}</span>
                <span>总长 {formatTime(duration)}</span>
                <span>
                  窗口 {formatTime(viewStart)} - {formatTime(visibleEnd)}
                </span>
                {isDecoding && <span className='text-blue-600'>正在解析波形...</span>}
                {pendingStart !== null && (
                  <span className='text-orange-600'>
                    已设起点 {formatTime(pendingStart)}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className='flex h-64 items-center justify-center border border-dashed border-slate-300 bg-slate-50 text-sm font-semibold text-slate-400'>
              选择音频后显示波形
            </div>
          )}

          <div className='mt-5 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto]'>
            <textarea
              value={draftText}
              onChange={event => setDraftText(event.target.value)}
              rows={3}
              placeholder='输入当前字幕文本'
              className='min-h-24 border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100'
            />
            <button
              type='button'
              onClick={handleMarkStart}
              disabled={!audioUrl}
              className='border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-black text-orange-700 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-40'>
              设为起点
            </button>
            <button
              type='button'
              onClick={handleMarkEnd}
              disabled={!audioUrl}
              className='border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40'>
              设为终点并添加
            </button>
          </div>

          <div className='mt-3 grid grid-cols-1 gap-3 md:grid-cols-[120px_120px_auto]'>
            <input
              type='number'
              min='0'
              step='0.01'
              value={manualStart}
              onChange={event => setManualStart(event.target.value)}
              className='border border-slate-200 bg-white p-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100'
              aria-label='开始秒数'
            />
            <input
              type='number'
              min='0'
              step='0.01'
              value={manualEnd}
              onChange={event => setManualEnd(event.target.value)}
              className='border border-slate-200 bg-white p-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100'
              aria-label='结束秒数'
            />
            <button
              type='button'
              onClick={handleManualAdd}
              disabled={!audioUrl}
              className='border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'>
              按秒数添加字幕
            </button>
          </div>

          <div className='mt-5 overflow-hidden border border-slate-200'>
            <div className='grid grid-cols-[76px_1fr_88px] bg-slate-50 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-slate-400'>
              <span>时间</span>
              <span>字幕</span>
              <span className='text-right'>操作</span>
            </div>
            {lines.length === 0 ? (
              <div className='px-3 py-8 text-center text-sm font-semibold text-slate-400'>
                暂无字幕切片
              </div>
            ) : (
              lines.map((line, index) => (
                <div
                  key={line.id}
                  className='grid grid-cols-[76px_1fr_88px] gap-3 border-t border-slate-100 px-3 py-3 text-sm'>
                  <button
                    type='button'
                    onClick={() => seekTo(line.start)}
                    className='text-left text-xs font-bold leading-5 text-blue-600'>
                    {formatTime(line.start)}
                    <br />
                    {formatTime(line.end)}
                  </button>
                  <textarea
                    value={line.text}
                    rows={2}
                    onChange={event => {
                      const nextText = event.target.value
                      setLines(prev =>
                        prev.map(item =>
                          item.id === line.id ? { ...item, text: nextText } : item,
                        ),
                      )
                    }}
                    className='w-full resize-none border border-slate-200 bg-white p-2 text-sm outline-none focus:ring-2 focus:ring-blue-100'
                  />
                  <button
                    type='button'
                    onClick={() =>
                      setLines(prev => prev.filter(item => item.id !== line.id))
                    }
                    className='self-start border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-black text-rose-600 hover:bg-rose-100'>
                    删除 {index + 1}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <aside className='border border-slate-200 bg-white p-4 shadow-sm md:p-6'>
          <h2 className='text-lg font-black text-slate-900'>导入到跟读</h2>
          <div className='mt-4 space-y-4'>
            <input
              value={title}
              onChange={event => setTitle(event.target.value)}
              placeholder='材料标题'
              className='w-full border border-slate-200 bg-slate-50 p-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100'
            />
            <input
              value={chapterName}
              onChange={event => setChapterName(event.target.value)}
              placeholder='章节名（可选，默认同标题）'
              className='w-full border border-slate-200 bg-slate-50 p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-100'
            />

            <div className='grid grid-cols-2 gap-2 border border-slate-100 bg-slate-50 p-1.5'>
              <button
                type='button'
                onClick={() => setCollectionMode('existing')}
                disabled={collections.length === 0}
                className={`px-3 py-2 text-sm font-black ${
                  collectionMode === 'existing'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-500'
                } disabled:opacity-40`}>
                已有集合
              </button>
              <button
                type='button'
                onClick={() => setCollectionMode('new')}
                className={`px-3 py-2 text-sm font-black ${
                  collectionMode === 'new'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-500'
                }`}>
                新建集合
              </button>
            </div>

            {collectionMode === 'existing' ? (
              <CollectionBrowserSelect
                options={collectionOptions}
                value={collectionId}
                onChange={setCollectionId}
                placeholder='选择跟读集合'
                recentKey='manage.upload.timedAudio.collection.recent'
              />
            ) : (
              <input
                value={collectionName}
                onChange={event => setCollectionName(event.target.value)}
                placeholder='新集合名称'
                className='w-full border border-slate-200 bg-slate-50 p-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100'
              />
            )}

            <textarea
              value={description}
              onChange={event => setDescription(event.target.value)}
              rows={3}
              placeholder='说明（可选）'
              className='w-full border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-blue-100'
            />
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
              <input
                value={source}
                onChange={event => setSource(event.target.value)}
                placeholder='来源'
                className='border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-blue-100'
              />
              <input
                value={language}
                onChange={event => setLanguage(event.target.value)}
                placeholder='语言'
                className='border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-blue-100'
              />
              <input
                value={difficulty}
                onChange={event => setDifficulty(event.target.value)}
                placeholder='难度'
                className='border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-blue-100'
              />
              <input
                value={tags}
                onChange={event => setTags(event.target.value)}
                placeholder='标签，逗号分隔'
                className='border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-blue-100'
              />
            </div>

            <button
              type='button'
              onClick={() => void handleSubmit()}
              disabled={status.type === 'loading'}
              className='w-full bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50'>
              导入为跟读材料
            </button>

            {status.message && (
              <div
                className={`border px-3 py-3 text-sm font-semibold ${
                  status.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : status.type === 'error'
                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : 'border-blue-200 bg-blue-50 text-blue-700'
                }`}>
                {status.message}
                {status.type === 'success' && status.lessonId && (
                  <Link
                    href={`/listening/${status.lessonId}`}
                    className='mt-2 block font-black underline'>
                    打开跟读材料
                  </Link>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}
