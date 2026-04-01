// app/admin/manage/lesson/[lessonId]/DialogueRow.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { updateDialogue, deleteDialogue } from '../../action'
import { useDialog } from '@/context/DialogContext'

type DialogueProps = {
  id: number
  text: string
  start: number
  end: number
}

type WaveformEditorProps = {
  audioFile: string
  start: number
  end: number
  onStartChange: (value: number) => void
  onEndChange: (value: number) => void
}

const WAVE_BUCKETS = 1200
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

function WaveformEditor({
  audioFile,
  start,
  end,
  onStartChange,
  onEndChange,
}: WaveformEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [duration, setDuration] = useState(0)
  const [peaks, setPeaks] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const viewport = useMemo(() => {
    if (duration <= 0) {
      return {
        viewStart: 0,
        viewEnd: 0,
        viewSpan: 0,
        startRatio: 0,
        endRatio: 0,
      }
    }
    const safeStart = clamp(start, 0, duration)
    const safeEnd = clamp(end, safeStart + 0.01, duration)
    const focusSpan = Math.max(0.08, safeEnd - safeStart)
    const zoomSpan = clamp(focusSpan * 8, 1.4, 10)
    const center = (safeStart + safeEnd) / 2
    const maxStart = Math.max(0, duration - zoomSpan)
    const viewStart = clamp(center - zoomSpan / 2, 0, maxStart)
    const viewEnd = Math.min(duration, viewStart + zoomSpan)
    const viewSpan = Math.max(0.0001, viewEnd - viewStart)
    return {
      viewStart,
      viewEnd,
      viewSpan,
      startRatio: clamp((safeStart - viewStart) / viewSpan, 0, 1),
      endRatio: clamp((safeEnd - viewStart) / viewSpan, 0, 1),
    }
  }, [duration, end, start])

  useEffect(() => {
    let cancelled = false
    const decodeAudio = async () => {
      setLoading(true)
      setLoadError('')
      try {
        const response = await fetch(audioFile)
        if (!response.ok) {
          throw new Error('音频加载失败')
        }
        const buffer = await response.arrayBuffer()
        const AudioCtx =
          window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
        if (!AudioCtx) throw new Error('当前浏览器不支持波形解析')
        const ctx = new AudioCtx()
        const decoded = await ctx.decodeAudioData(buffer.slice(0))
        if (cancelled) return

        const channelData = decoded.getChannelData(0)
        const blockSize = Math.max(1, Math.floor(channelData.length / WAVE_BUCKETS))
        const nextPeaks: number[] = []
        for (let i = 0; i < WAVE_BUCKETS; i += 1) {
          const startIdx = i * blockSize
          const endIdx = Math.min(channelData.length, startIdx + blockSize)
          let max = 0
          for (let j = startIdx; j < endIdx; j += 1) {
            const value = Math.abs(channelData[j])
            if (value > max) max = value
          }
          nextPeaks.push(max)
        }
        setDuration(decoded.duration)
        setPeaks(nextPeaks)
        await ctx.close()
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : '波形加载失败')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void decodeAudio()
    return () => {
      cancelled = true
    }
  }, [audioFile])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || peaks.length === 0) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    canvas.width = Math.floor(rect.width * dpr)
    canvas.height = Math.floor(rect.height * dpr)

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, rect.width, rect.height)

    const midY = rect.height / 2
    const visibleBars = Math.max(220, Math.floor(rect.width * 1.35))
    const barWidth = rect.width / visibleBars

    const selStartX = viewport.startRatio * rect.width
    const selEndX = viewport.endRatio * rect.width
    ctx.fillStyle = '#eef2ff'
    ctx.fillRect(selStartX, 0, Math.max(0, selEndX - selStartX), rect.height)

    for (let i = 0; i < visibleBars; i += 1) {
      const barCenterRatio = (i + 0.5) / visibleBars
      const time = viewport.viewStart + barCenterRatio * viewport.viewSpan
      const peakIndex = clamp(
        Math.floor((time / duration) * (peaks.length - 1)),
        0,
        peaks.length - 1,
      )
      const amp = peaks[peakIndex] || 0
      const barHeight = Math.max(1, amp * (rect.height * 0.9))
      const x = i * barWidth
      const y = midY - barHeight / 2
      const inSelection =
        x + barWidth >= selStartX && x <= selEndX && selEndX > selStartX
      ctx.fillStyle = inSelection ? '#4f46e5' : '#94a3b8'
      ctx.fillRect(x, y, Math.max(1, barWidth * 0.85), barHeight)
    }

    ctx.fillStyle = '#3730a3'
    ctx.fillRect(selStartX, 0, 1.5, rect.height)
    ctx.fillRect(selEndX, 0, 1.5, rect.height)

    // 中心参考线，便于把目标区间维持在中间观察
    ctx.fillStyle = '#c7d2fe'
    ctx.fillRect(rect.width / 2, 0, 1, rect.height)
  }, [duration, peaks, viewport])

  const shiftBoundary = (target: 'start' | 'end', delta: number) => {
    if (duration <= 0) return
    const minGap = 0.02
    if (target === 'start') {
      const next = clamp(start + delta, 0, Math.max(0, end - minGap))
      onStartChange(Number(next.toFixed(2)))
    } else {
      const next = clamp(end + delta, Math.min(duration, start + minGap), duration)
      onEndChange(Number(next.toFixed(2)))
    }
  }

  const playSelection = async () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(audioFile)
    }
    const player = audioRef.current
    player.pause()
    player.currentTime = Math.max(0, start)
    try {
      await player.play()
    } catch {
      return
    }
    const stopAtEnd = () => {
      if (player.currentTime >= end) {
        player.pause()
        player.removeEventListener('timeupdate', stopAtEnd)
      }
    }
    player.addEventListener('timeupdate', stopAtEnd)
  }

  return (
    <div className='mt-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3'>
      <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
        <p className='text-[11px] font-bold text-indigo-700'>波形微调</p>
        <button
          type='button'
          onClick={() => void playSelection()}
          className='rounded-md border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50'>
          试听区间
        </button>
      </div>

      {loading ? (
        <div className='h-20 rounded-lg border border-indigo-100 bg-white/80 px-3 py-2 text-xs text-gray-400'>
          正在加载音频波形...
        </div>
      ) : loadError ? (
        <div className='h-20 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700'>
          {loadError}
        </div>
      ) : (
        <div className='space-y-2'>
          <div className='relative h-20 overflow-hidden rounded-lg border border-indigo-100 bg-white'>
            <canvas ref={canvasRef} className='h-full w-full' />
          </div>
          <p className='text-[11px] text-indigo-700/80'>
            视窗 {viewport.viewStart.toFixed(2)}s - {viewport.viewEnd.toFixed(2)}s（已自动居中放大当前区间）
          </p>
          <div className='grid grid-cols-1 gap-2 md:grid-cols-2'>
            <div className='rounded-lg border border-indigo-100 bg-white p-2'>
              <p className='mb-1 text-[11px] font-semibold text-gray-500'>开始</p>
              <div className='flex items-center gap-1.5'>
                <button
                  type='button'
                  onClick={() => shiftBoundary('start', -0.05)}
                  className='rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50'>
                  -0.05
                </button>
                <button
                  type='button'
                  onClick={() => shiftBoundary('start', -0.01)}
                  className='rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50'>
                  -0.01
                </button>
                <span className='min-w-[52px] text-center text-xs font-bold text-indigo-700'>
                  {start.toFixed(2)}
                </span>
                <button
                  type='button'
                  onClick={() => shiftBoundary('start', 0.01)}
                  className='rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50'>
                  +0.01
                </button>
                <button
                  type='button'
                  onClick={() => shiftBoundary('start', 0.05)}
                  className='rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50'>
                  +0.05
                </button>
              </div>
            </div>
            <div className='rounded-lg border border-indigo-100 bg-white p-2'>
              <p className='mb-1 text-[11px] font-semibold text-gray-500'>结束</p>
              <div className='flex items-center gap-1.5'>
                <button
                  type='button'
                  onClick={() => shiftBoundary('end', -0.05)}
                  className='rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50'>
                  -0.05
                </button>
                <button
                  type='button'
                  onClick={() => shiftBoundary('end', -0.01)}
                  className='rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50'>
                  -0.01
                </button>
                <span className='min-w-[52px] text-center text-xs font-bold text-indigo-700'>
                  {end.toFixed(2)}
                </span>
                <button
                  type='button'
                  onClick={() => shiftBoundary('end', 0.01)}
                  className='rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50'>
                  +0.01
                </button>
                <button
                  type='button'
                  onClick={() => shiftBoundary('end', 0.05)}
                  className='rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50'>
                  +0.05
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function DialogueRow({
  dialogue,
  audioFile,
}: {
  dialogue: DialogueProps
  audioFile: string
}) {
  const dialogModal = useDialog()
  const [isEditing, setIsEditing] = useState(false)
  const [text, setText] = useState(dialogue.text)
  const [start, setStart] = useState(dialogue.start)
  const [end, setEnd] = useState(dialogue.end)
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    if (end <= start) {
      await dialogModal.alert('结束时间必须大于开始时间。')
      return
    }
    setLoading(true)
    const res = await updateDialogue(dialogue.id, {
      text,
      start: Number(start),
      end: Number(end),
    })
    setLoading(false)
    if (res.success) {
      setIsEditing(false)
    } else {
      await dialogModal.alert(res.message)
    }
  }

  const handleDelete = async () => {
    const shouldDelete = await dialogModal.confirm('确定要删除这句字幕吗？删除后不可恢复。', {
      title: '删除字幕',
      danger: true,
      confirmText: '删除',
    })
    if (!shouldDelete) return
    setLoading(true)
    await deleteDialogue(dialogue.id)
  }

  if (isEditing) {
    return (
      <div className='rounded-xl border border-blue-200 bg-blue-50/70 p-3 md:p-4'>
        <div className='grid grid-cols-1 gap-2 md:grid-cols-[84px_20px_84px_1fr_auto_auto] md:items-center'>
          <input
            type='number'
            step='0.01'
            value={start}
            onChange={e => setStart(Number(e.target.value))}
            className='rounded border border-blue-200 bg-white p-1.5 text-sm'
            title='开始时间'
          />
          <span className='hidden text-center text-gray-400 md:block'>-</span>
          <input
            type='number'
            step='0.01'
            value={end}
            onChange={e => setEnd(Number(e.target.value))}
            className='rounded border border-blue-200 bg-white p-1.5 text-sm'
            title='结束时间'
          />
          <input
            type='text'
            value={text}
            onChange={e => setText(e.target.value)}
            className='w-full rounded border border-blue-200 bg-white p-1.5 text-sm'
          />
          <button
            onClick={handleSave}
            disabled={loading}
            className='rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700'>
            保存
          </button>
          <button
            onClick={() => setIsEditing(false)}
            className='rounded border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50'>
            取消
          </button>
        </div>

        <WaveformEditor
          audioFile={audioFile}
          start={start}
          end={end}
          onStartChange={setStart}
          onEndChange={setEnd}
        />
      </div>
    )
  }

  return (
    <div className='group rounded-lg border border-transparent p-2 transition-colors hover:border-gray-200 hover:bg-gray-50 md:flex md:items-center md:gap-4'>
      <div className='mb-1 text-[11px] font-mono text-gray-400 md:mb-0 md:mr-4 md:w-32 md:shrink-0 md:text-right md:text-xs'>
        [{dialogue.start.toFixed(2)} - {dialogue.end.toFixed(2)}]
      </div>
      <div className='flex-1 text-sm text-gray-800 leading-relaxed'>{dialogue.text}</div>
      <div className='mt-2 flex gap-2 opacity-100 transition-opacity md:mt-0 md:shrink-0 md:opacity-0 md:group-hover:opacity-100'>
        <button
          onClick={() => setIsEditing(true)}
          className='rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-100'>
          编辑
        </button>
        <button
          onClick={handleDelete}
          disabled={loading}
          className='rounded-md border border-red-100 bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-100'>
          删除
        </button>
      </div>
    </div>
  )
}
