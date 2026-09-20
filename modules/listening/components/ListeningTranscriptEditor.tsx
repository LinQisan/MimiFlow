'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useRouter } from 'next/navigation'

import {
  replaceListeningSubtitles,
  updateListeningDialogueText,
  updateListeningDialogueTimeline,
} from '@/modules/listening/manage-actions'
import { useDialog } from '@/context/DialogContext'
import { serializeTimelineToAss } from '@/modules/import/audio/ass'
import {
  getTimelineOverlapWarningsAtId,
  getTimelinePlaybackRangeError,
  getTimelineRangeError,
  MIN_TIMELINE_DURATION,
} from '@/modules/listening/domain/timeline'
import { useListeningAudio } from './ListeningAudioProvider'

type Dialogue = {
  stableId: string
  text: string
  start: number
  end: number
}

type Props = {
  materialId: string
  materialTitle: string
  initialDialogues: Dialogue[]
}

type TimelineBoundary = 'start' | 'end'

const CONTEXT_SECONDS = 1.5

function formatSeconds(value: number) {
  return (Number.isFinite(value) ? value : 0).toFixed(3)
}

function parseSeconds(value: string) {
  if (!value.trim()) return Number.NaN
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function buildWaveformPeaks(buffer: AudioBuffer, targetLength = 1600) {
  const channel = buffer.getChannelData(0)
  const samplesPerPeak = Math.max(1, Math.ceil(channel.length / targetLength))
  const rawPeaks: number[] = []

  for (let offset = 0; offset < channel.length; offset += samplesPerPeak) {
    const end = Math.min(channel.length, offset + samplesPerPeak)
    let peak = 0
    for (let index = offset; index < end; index += 1) {
      peak = Math.max(peak, Math.abs(channel[index]))
    }
    rawPeaks.push(peak)
  }

  const maximum = Math.max(...rawPeaks, 0.001)
  return rawPeaks.map(peak => peak / maximum)
}

function getWaveformWindow(start: number, end: number, duration: number) {
  const maxTime = duration > 0 ? duration : Math.max(end + CONTEXT_SECONDS, 4)
  let viewStart = Math.max(0, start - CONTEXT_SECONDS)
  let viewEnd = Math.min(maxTime, end + CONTEXT_SECONDS)
  const minimumWindow = Math.min(maxTime, 4)

  if (viewEnd - viewStart < minimumWindow) {
    viewEnd = Math.min(maxTime, viewStart + minimumWindow)
    viewStart = Math.max(0, viewEnd - minimumWindow)
  }

  return { viewStart, viewEnd: Math.max(viewStart + 0.001, viewEnd) }
}

type TimelineWaveformProps = {
  src: string
  start: number
  end: number
  duration: number
  currentTime: number
  activeBoundary: TimelineBoundary
  onBoundaryFocus: (boundary: TimelineBoundary) => void
  onBoundaryChange: (boundary: TimelineBoundary, value: number) => void
  onKeyboardAdjust: (boundary: TimelineBoundary, delta: number) => void
  onPlayPause: () => void
  onSeek: (time: number) => void
}

function TimelineWaveform({
  src,
  start,
  end,
  duration,
  currentTime,
  activeBoundary,
  onBoundaryFocus,
  onBoundaryChange,
  onKeyboardAdjust,
  onPlayPause,
  onSeek,
}: TimelineWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const waveformRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<TimelineBoundary | null>(null)
  const [peaks, setPeaks] = useState<number[] | null>(null)
  const [waveformState, setWaveformState] = useState<
    'loading' | 'ready' | 'error'
  >('loading')
  const { viewStart, viewEnd } = useMemo(
    () => getWaveformWindow(start, end, duration),
    [duration, end, start],
  )

  useEffect(() => {
    if (!src) {
      setPeaks(null)
      setWaveformState('error')
      return
    }

    const abortController = new AbortController()
    let disposed = false
    let audioContext: AudioContext | null = null

    const loadWaveform = async () => {
      try {
        setWaveformState('loading')
        const response = await fetch(src, { signal: abortController.signal })
        if (!response.ok) throw new Error('waveform request failed')
        const audioData = await response.arrayBuffer()
        if (disposed) return

        const contextWindow = window as Window & {
          webkitAudioContext?: typeof AudioContext
        }
        const AudioContextConstructor =
          window.AudioContext || contextWindow.webkitAudioContext
        if (!AudioContextConstructor) throw new Error('AudioContext unavailable')

        audioContext = new AudioContextConstructor()
        const decoded = await audioContext.decodeAudioData(audioData)
        if (disposed) return
        setPeaks(buildWaveformPeaks(decoded))
        setWaveformState('ready')
      } catch (error) {
        if (
          disposed ||
          (error instanceof DOMException && error.name === 'AbortError')
        ) {
          return
        }
        setPeaks(null)
        setWaveformState('error')
      }
    }

    void loadWaveform()
    return () => {
      disposed = true
      abortController.abort()
      if (audioContext) void audioContext.close()
    }
  }, [src])

  const timeFromClientX = useCallback(
    (clientX: number) => {
      const element = waveformRef.current
      if (!element) return null
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0) return null
      const progress = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / rect.width),
      )
      return viewStart + progress * (viewEnd - viewStart)
    },
    [viewEnd, viewStart],
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = waveformRef.current
    if (!canvas || !container) return
    const rect = container.getBoundingClientRect()
    if (rect.width <= 0) return

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    const width = rect.width
    const height = rect.height
    canvas.width = Math.floor(width * pixelRatio)
    canvas.height = Math.floor(height * pixelRatio)
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    context.clearRect(0, 0, width, height)

    const viewDuration = Math.max(0.001, viewEnd - viewStart)
    const toX = (time: number) => ((time - viewStart) / viewDuration) * width
    const selectionStart = Math.max(0, Math.min(width, toX(start)))
    const selectionEnd = Math.max(0, Math.min(width, toX(end)))

    context.fillStyle = 'rgba(226, 232, 240, 0.72)'
    context.fillRect(
      selectionStart,
      0,
      Math.max(0, selectionEnd - selectionStart),
      height,
    )

    context.strokeStyle = '#cbd5e1'
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(0, height / 2)
    context.lineTo(width, height / 2)
    context.stroke()

    for (let x = 0; x < width; x += 1) {
      const time = viewStart + (x / Math.max(1, width - 1)) * viewDuration
      const peakIndex =
        peaks && duration > 0
          ? Math.max(
              0,
              Math.min(
                peaks.length - 1,
                Math.floor((time / duration) * peaks.length),
              ),
            )
          : 0
      const amplitude = peaks
        ? Math.max(0.03, peaks[peakIndex] || 0)
        : 0.06 + Math.abs(Math.sin(x * 0.11)) * 0.06
      const barHeight = Math.max(2, amplitude * (height * 0.78))
      const isSelected = time >= start && time <= end
      context.strokeStyle = isSelected ? '#475569' : '#94a3b8'
      context.lineWidth = 1
      context.beginPath()
      context.moveTo(x + 0.5, height / 2 - barHeight / 2)
      context.lineTo(x + 0.5, height / 2 + barHeight / 2)
      context.stroke()
    }

    if (currentTime >= viewStart && currentTime <= viewEnd) {
      const playheadX = Math.max(0, Math.min(width, toX(currentTime)))
      context.strokeStyle = '#0f766e'
      context.lineWidth = 2
      context.beginPath()
      context.moveTo(playheadX, 0)
      context.lineTo(playheadX, height)
      context.stroke()
    }
  }, [currentTime, duration, end, peaks, start, viewEnd, viewStart])

  useEffect(() => {
    draw()
    const container = waveformRef.current
    if (!container || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(draw)
    observer.observe(container)
    return () => observer.disconnect()
  }, [draw])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const boundary = dragRef.current
      if (!boundary) return
      const time = timeFromClientX(event.clientX)
      if (time === null) return
      const minimum =
        boundary === 'start' ? 0 : start + MIN_TIMELINE_DURATION
      const maximum =
        boundary === 'start'
          ? end - MIN_TIMELINE_DURATION
          : duration > 0
            ? duration
            : Math.max(viewEnd, end + MIN_TIMELINE_DURATION)
      onBoundaryChange(
        boundary,
        Math.max(minimum, Math.min(maximum, time)),
      )
    }
    const handlePointerUp = () => {
      dragRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [duration, end, onBoundaryChange, start, timeFromClientX, viewEnd])

  const percent = (time: number) =>
    `${Math.max(
      0,
      Math.min(100, ((time - viewStart) / (viewEnd - viewStart)) * 100),
    )}%`

  const startDrag = (
    boundary: TimelineBoundary,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = boundary
    onBoundaryFocus(boundary)
  }

  const handleWaveformClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    const time = timeFromClientX(event.clientX)
    if (time !== null) onSeek(time)
  }

  const handleBoundaryKeyDown = (
    boundary: TimelineBoundary,
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      event.stopPropagation()
      const amount = event.shiftKey ? 0.1 : 0.01
      onKeyboardAdjust(
        boundary,
        event.key === 'ArrowLeft' ? -amount : amount,
      )
    } else if (event.code === 'Space') {
      event.preventDefault()
      event.stopPropagation()
      onPlayPause()
    }
  }

  return (
    <div className='mt-3'>
      <div
        ref={waveformRef}
        className='relative h-[104px] cursor-crosshair touch-none overflow-hidden border border-slate-200 bg-slate-50'
        onClick={handleWaveformClick}
        aria-label='音频波形时间轴'>
        <canvas ref={canvasRef} className='absolute inset-0 h-full w-full' />
        {(['start', 'end'] as const).map(boundary => {
          const time = boundary === 'start' ? start : end
          return (
            <button
              key={boundary}
              type='button'
              role='slider'
              tabIndex={0}
              aria-label={
                boundary === 'start' ? '拖动 Start 边界' : '拖动 End 边界'
              }
              aria-valuemin={0}
              aria-valuemax={duration > 0 ? duration : undefined}
              aria-valuenow={time}
              onFocus={() => onBoundaryFocus(boundary)}
              onPointerDown={event => startDrag(boundary, event)}
              onKeyDown={event => handleBoundaryKeyDown(boundary, event)}
              className={`absolute inset-y-0 z-10 w-5 -translate-x-1/2 cursor-ew-resize border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1 ${activeBoundary === boundary ? 'text-teal-700' : 'text-slate-700'}`}
              style={{ left: percent(time) }}>
              <span className='absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-current' />
              <span className='absolute top-1/2 left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-current bg-white' />
            </button>
          )
        })}
        {waveformState === 'loading' ? (
          <span className='pointer-events-none absolute inset-x-3 bottom-2 text-[11px] text-slate-400'>
            正在读取波形…
          </span>
        ) : null}
        {waveformState === 'error' ? (
          <span className='pointer-events-none absolute inset-x-3 bottom-2 text-[11px] text-slate-400'>
            波形读取失败，仍可使用时间轴和试听功能。
          </span>
        ) : null}
      </div>
      <div className='mt-1 grid grid-cols-4 gap-2 font-mono text-[10px] tabular-nums text-slate-400'>
        <span>{formatSeconds(viewStart)}</span>
        <span className='text-center text-slate-600'>
          Start {formatSeconds(start)}
        </span>
        <span className='text-center text-slate-600'>
          End {formatSeconds(end)}
        </span>
        <span className='text-right'>{formatSeconds(viewEnd)}</span>
      </div>
    </div>
  )
}

type TimeAdjusterProps = {
  label: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
  onFocus: () => void
  onNudge: (delta: number) => void
}

function TimeAdjuster({
  label,
  value,
  disabled,
  onChange,
  onFocus,
  onNudge,
}: TimeAdjusterProps) {
  return (
    <div className='grid gap-1.5 sm:grid-cols-[3.5rem_minmax(0,1fr)] sm:items-center'>
      <span className='text-xs font-semibold text-slate-500'>{label}</span>
      <div className='flex flex-wrap items-center gap-1'>
        <button
          type='button'
          disabled={disabled}
          onClick={() => onNudge(-0.1)}
          className='min-h-8 border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-500 transition hover:border-slate-400 hover:text-slate-900 disabled:opacity-40'>
          −0.10
        </button>
        <button
          type='button'
          disabled={disabled}
          onClick={() => onNudge(-0.01)}
          className='min-h-8 border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-500 transition hover:border-slate-400 hover:text-slate-900 disabled:opacity-40'>
          −0.01
        </button>
        <input
          type='text'
          inputMode='decimal'
          spellCheck={false}
          disabled={disabled}
          value={value}
          onChange={event => onChange(event.currentTarget.value)}
          onFocus={onFocus}
          aria-label={`${label} 时间（秒）`}
          className='h-8 w-24 border border-slate-300 bg-white px-2 text-center font-mono text-xs font-semibold tabular-nums text-slate-800 outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-100'
        />
        <button
          type='button'
          disabled={disabled}
          onClick={() => onNudge(0.01)}
          className='min-h-8 border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-500 transition hover:border-slate-400 hover:text-slate-900 disabled:opacity-40'>
          +0.01
        </button>
        <button
          type='button'
          disabled={disabled}
          onClick={() => onNudge(0.1)}
          className='min-h-8 border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-500 transition hover:border-slate-400 hover:text-slate-900 disabled:opacity-40'>
          +0.10
        </button>
      </div>
    </div>
  )
}

export default function ListeningTranscriptEditor({
  materialId,
  materialTitle,
  initialDialogues,
}: Props) {
  const dialog = useDialog()
  const router = useRouter()
  const audio = useListeningAudio()
  const subtitleInputRef = useRef<HTMLInputElement>(null)
  const timelineRootRef = useRef<HTMLDivElement>(null)
  const [dialogues, setDialogues] = useState(initialDialogues)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [timelineId, setTimelineId] = useState<string | null>(null)
  const [timelineDraft, setTimelineDraft] = useState({ start: '', end: '' })
  const [activeBoundary, setActiveBoundary] = useState<TimelineBoundary>('start')
  const [draft, setDraft] = useState('')
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'success' | 'error'>('success')
  const [isPending, startTransition] = useTransition()

  const beginEditing = (stableId: string) => {
    const dialogue = dialogues.find(item => item.stableId === stableId)
    if (!dialogue) return
    audio.pause()
    setTimelineId(null)
    setEditingId(stableId)
    setDraft(dialogue.text)
    setMessage('')
  }

  const cancelEditing = () => {
    setEditingId(null)
    setDraft('')
    setMessage('')
  }

  const toggleTimelineEditor = (stableId: string) => {
    audio.pause()
    if (timelineId === stableId) {
      setTimelineId(null)
      return
    }
    const dialogue = dialogues.find(item => item.stableId === stableId)
    if (!dialogue) return
    setEditingId(null)
    setDraft('')
    setTimelineId(stableId)
    setTimelineDraft({
      start: formatSeconds(dialogue.start),
      end: formatSeconds(dialogue.end),
    })
    setActiveBoundary('start')
    setMessage('')
  }

  const saveText = (stableId: string) => {
    const text = draft.trim()
    if (!text) {
      setMessage('文本不能为空。')
      return
    }

    const formData = new FormData()
    formData.set('id', materialId)
    formData.set('dialogueId', stableId)
    formData.set('text', text)

    startTransition(async () => {
      const result = await updateListeningDialogueText(formData)
      if (!result.success) {
        setMessageTone('error')
        setMessage(result.message || '保存失败。')
        return
      }
      setDialogues(previous =>
        previous.map(dialogue =>
          dialogue.stableId === stableId
            ? { ...dialogue, text: result.text }
            : dialogue,
        ),
      )
      setEditingId(null)
      setDraft('')
      setMessageTone('success')
      setMessage('文本已更新。')
    })
  }

  const replaceSubtitles = async (file: File) => {
    const confirmed = await dialog.confirm(
      `将使用“${file.name}”覆盖当前 ${dialogues.length} 句时间轴。音频和题目不会改变，是否继续？`,
      {
        title: '覆盖当前字幕',
        confirmText: '确认覆盖',
        danger: true,
      },
    )
    if (!confirmed) return

    const formData = new FormData()
    formData.set('id', materialId)
    formData.set('subtitleFile', file)
    audio.pause()
    setTimelineId(null)
    setTimelineDraft({ start: '', end: '' })
    setActiveBoundary('start')
    setMessage('')
    startTransition(async () => {
      const result = await replaceListeningSubtitles(formData)
      if (!result.success) {
        setMessageTone('error')
        setMessage(result.message || '覆盖字幕失败。')
        return
      }
      setDialogues(
        result.dialogues.map(dialogue => ({
          stableId: dialogue.stableId,
          text: dialogue.text,
          start: dialogue.start,
          end: dialogue.end,
        })),
      )
      audio.pause()
      setEditingId(null)
      setTimelineId(null)
      setTimelineDraft({ start: '', end: '' })
      setActiveBoundary('start')
      setDraft('')
      setMessageTone('success')
      setMessage(result.message || '字幕已覆盖。')
      router.refresh()
    })
  }

  const downloadAss = () => {
    const content = serializeTimelineToAss(dialogues, materialTitle)
    const blob = new Blob([`\uFEFF${content}`], {
      type: 'text/plain;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const safeTitle =
      materialTitle
        .normalize('NFKC')
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-.]+|[-.]+$/g, '')
        .slice(0, 100) || 'timeline'
    link.href = url
    link.download = `${safeTitle}.ass`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const timelineDialogue =
    timelineId === null
      ? null
      : dialogues.find(dialogue => dialogue.stableId === timelineId) || null
  const parsedTimeline = useMemo(() => {
    if (!timelineDialogue) return null
    return {
      start: parseSeconds(timelineDraft.start),
      end: parseSeconds(timelineDraft.end),
    }
  }, [timelineDialogue, timelineDraft.end, timelineDraft.start])
  const timelineError = useMemo(() => {
    if (!parsedTimeline) return null
    return getTimelineRangeError({
      ...parsedTimeline,
      audioDuration: audio.duration > 0 ? audio.duration : undefined,
    })
  }, [audio.duration, parsedTimeline])
  const timelinePlaybackError = useMemo(() => {
    if (!parsedTimeline) return null
    return getTimelinePlaybackRangeError({
      ...parsedTimeline,
      audioDuration: audio.duration > 0 ? audio.duration : undefined,
    })
  }, [audio.duration, parsedTimeline])
  const timelineDurationPending = Boolean(audio.src) && audio.duration <= 0
  const overlapWarnings = useMemo(() => {
    if (timelineId === null || !parsedTimeline) {
      return { previous: 0, next: 0 }
    }
    return getTimelineOverlapWarningsAtId(
      dialogues,
      timelineId,
      parsedTimeline,
    )
  }, [dialogues, parsedTimeline, timelineId])
  const timelineDirty = Boolean(
    timelineDialogue &&
      parsedTimeline &&
      (parsedTimeline.start !== timelineDialogue.start ||
        parsedTimeline.end !== timelineDialogue.end),
  )

  const setDraftBoundary = (boundary: TimelineBoundary, value: string) => {
    setTimelineDraft(previous => ({ ...previous, [boundary]: value }))
  }

  const setNumericBoundary = (boundary: TimelineBoundary, value: number) => {
    setDraftBoundary(boundary, formatSeconds(value))
  }

  const nudgeBoundary = (boundary: TimelineBoundary, delta: number) => {
    if (!timelineDialogue) return
    const currentStart =
      parsedTimeline && Number.isFinite(parsedTimeline.start)
        ? parsedTimeline.start
        : timelineDialogue.start
    const currentEnd =
      parsedTimeline && Number.isFinite(parsedTimeline.end)
        ? parsedTimeline.end
        : timelineDialogue.end
    const rawValue = boundary === 'start' ? currentStart : currentEnd
    const nextValue = rawValue + delta
    const value =
      boundary === 'start'
        ? Math.max(0, Math.min(nextValue, currentEnd - MIN_TIMELINE_DURATION))
        : Math.max(
            currentStart + MIN_TIMELINE_DURATION,
            Math.min(
              nextValue,
              audio.duration > 0 ? audio.duration : Number.POSITIVE_INFINITY,
            ),
          )
    setNumericBoundary(boundary, value)
    setActiveBoundary(boundary)
  }

  const handleTimelineKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target.isContentEditable ||
      target.closest('button, select')
    ) {
      return
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const amount = event.shiftKey ? 0.1 : 0.01
      nudgeBoundary(
        activeBoundary,
        event.key === 'ArrowLeft' ? -amount : amount,
      )
      return
    }
    if (event.code === 'Space') {
      event.preventDefault()
      if (
        !parsedTimeline ||
        timelinePlaybackError ||
        timelineId === null
      ) {
        return
      }
      audio.toggleRange(timelineId, parsedTimeline.start, parsedTimeline.end)
    }
  }

  const handleTimelineRootMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (!target.closest('button, input, textarea, select')) {
      timelineRootRef.current?.focus()
    }
  }

  const saveTimeline = () => {
    if (timelineId === null || !parsedTimeline || timelineError) return
    const formData = new FormData()
    formData.set('id', materialId)
    formData.set('dialogueId', timelineId)
    formData.set('start', String(parsedTimeline.start))
    formData.set('end', String(parsedTimeline.end))
    if (audio.duration > 0) formData.set('audioDuration', String(audio.duration))

    audio.pause()
    startTransition(async () => {
      const result = await updateListeningDialogueTimeline(formData)
      if (!result.success) {
        setMessageTone('error')
        setMessage(result.message || '保存时间轴失败。')
        return
      }
      setDialogues(previous =>
        previous.map(dialogue =>
          dialogue.stableId === timelineId
            ? { ...dialogue, start: result.start, end: result.end }
            : dialogue,
        ),
      )
      setTimelineDraft({
        start: formatSeconds(result.start),
        end: formatSeconds(result.end),
      })
      setMessageTone('success')
      setMessage('时间轴已保存。')
    })
  }

  const effectiveRangeForRow = (dialogue: Dialogue) => {
    if (timelineId !== dialogue.stableId || !parsedTimeline) {
      return { start: dialogue.start, end: dialogue.end }
    }
    if (
      !Number.isFinite(parsedTimeline.start) ||
      !Number.isFinite(parsedTimeline.end)
    ) {
      return null
    }
    return parsedTimeline
  }

  const toggleRowPlayback = (dialogue: Dialogue) => {
    const range = effectiveRangeForRow(dialogue)
    if (!range) {
      setMessageTone('error')
      setMessage('请先输入有效的开始和结束时间。')
      return
    }
    audio.toggleRange(dialogue.stableId, range.start, range.end)
  }

  const playBoundaryPreview = (boundary: TimelineBoundary) => {
    if (
      timelineId === null ||
      !parsedTimeline ||
      timelinePlaybackError
    ) {
      return
    }
    const start =
      boundary === 'start'
        ? Math.max(0, parsedTimeline.start - 0.4)
        : Math.max(0, parsedTimeline.end - 0.6)
    const end =
      boundary === 'start'
        ? parsedTimeline.start + 0.6
        : parsedTimeline.end + 0.4
    audio.playRange(
      timelineId,
      start,
      audio.duration > 0 ? Math.min(end, audio.duration) : end,
    )
  }

  return (
    <details open className='group border-y border-slate-200 py-4'>
      <summary className='flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-semibold text-slate-800 marker:content-none md:px-6'>
        <span>逐句文本</span>
        <span className='text-xs font-medium text-slate-400 group-open:hidden'>展开编辑</span>
        <span className='hidden text-xs font-medium text-slate-400 group-open:inline'>可逐句修改</span>
      </summary>
      <div className='border-t border-slate-100'>
        <div className='flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 md:px-6'>
          <p className='text-xs leading-5 text-slate-500'>
            点击时间轴或“调整”可校正切点；重新上传会覆盖全部时间与文本。
          </p>
          <div className='flex flex-wrap gap-2'>
            <input
              ref={subtitleInputRef}
              type='file'
              accept='.ass,.ssa,.srt,text/x-ass,text/x-ssa,application/x-subrip,text/plain'
              className='sr-only'
              onChange={event => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                if (file) void replaceSubtitles(file)
              }}
            />
            <button
              type='button'
              disabled={
                isPending || editingId !== null || timelineId !== null
              }
              onClick={() => subtitleInputRef.current?.click()}
              className='ui-btn ui-btn-sm disabled:opacity-50'>
              {isPending ? '处理中…' : '重新上传字幕'}
            </button>
            <button
              type='button'
              disabled={
                isPending ||
                editingId !== null ||
                timelineId !== null ||
                dialogues.length === 0
              }
              onClick={downloadAss}
              className='ui-btn ui-btn-sm disabled:opacity-50'>
              下载 ASS
            </button>
          </div>
        </div>
        <div className='hidden border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-semibold text-slate-500 md:grid md:grid-cols-[11rem_minmax(0,1fr)_auto] md:px-6'>
          <span className='text-right'>播放 / 时间轴</span>
          <span className='pl-4'>文本内容</span>
          <span className='text-right'>操作</span>
        </div>
        <div className='divide-y divide-slate-100 px-4 md:px-6'>
          {dialogues.length === 0 ? (
            <div className='py-10 text-center text-sm text-slate-400'>
              暂无文本数据
            </div>
          ) : (
            dialogues.map((dialogue, index) => {
              const isEditing = editingId === dialogue.stableId
              const isTimelineEditing = timelineId === dialogue.stableId
              const isPlayingRow =
                audio.isPlaying && audio.activeRowId === dialogue.stableId
              const canPlay = Boolean(audio.src)
              return (
                <div
                  key={dialogue.stableId}
                  className={`py-3.5 transition-colors ${
                    isPlayingRow ? 'bg-slate-50/90' : ''
                  }`}>
                  <div className='grid gap-2 md:grid-cols-[11rem_minmax(0,1fr)_auto] md:items-start md:gap-4'>
                    <div className='flex items-start gap-2 font-mono text-xs font-semibold tabular-nums text-slate-500 md:justify-end'>
                      <button
                        type='button'
                        disabled={!canPlay}
                        onClick={() => toggleRowPlayback(dialogue)}
                        aria-label={
                          isPlayingRow
                            ? `暂停第 ${index + 1} 段`
                            : `播放第 ${index + 1} 段`
                        }
                        className='inline-flex h-8 w-8 shrink-0 items-center justify-center border border-slate-200 bg-white text-[11px] text-slate-700 transition hover:border-slate-400 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40'>
                        {isPlayingRow ? 'Ⅱ' : '▶'}
                      </button>
                      <div className='min-w-0 text-right'>
                        <button
                          type='button'
                          onClick={() => toggleTimelineEditor(dialogue.stableId)}
                          disabled={isPending || editingId !== null}
                          className='whitespace-nowrap text-left font-mono text-xs font-semibold tabular-nums text-slate-500 underline decoration-slate-200 underline-offset-4 transition hover:text-slate-950 disabled:opacity-40 md:text-right'>
                          {formatSeconds(dialogue.start)} → {formatSeconds(dialogue.end)}
                        </button>
                        {isTimelineEditing && timelineDirty ? (
                          <span className='mt-1 block text-[10px] font-semibold text-amber-700'>
                            未保存
                          </span>
                        ) : null}
                        {isPlayingRow ? (
                          <span className='mt-1 block text-[10px] font-medium text-teal-700'>
                            {formatSeconds(audio.currentTime)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {isEditing ? (
                      <div className='min-w-0'>
                        <textarea
                          autoFocus
                          value={draft}
                          onChange={event => setDraft(event.currentTarget.value)}
                          rows={3}
                          aria-label={`编辑第 ${index + 1} 句文本`}
                          className='w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100'
                        />
                        {message ? (
                          <p className='mt-1 text-xs font-semibold text-rose-600'>
                            {message}
                          </p>
                        ) : null}
                        <div className='mt-2 flex gap-2'>
                          <button
                            type='button'
                            disabled={isPending}
                            onClick={() => saveText(dialogue.stableId)}
                            className='ui-btn ui-btn-sm ui-btn-primary disabled:opacity-50'>
                            {isPending ? '保存中…' : '保存'}
                          </button>
                          <button
                            type='button'
                            disabled={isPending}
                            onClick={cancelEditing}
                            className='ui-btn ui-btn-sm disabled:opacity-50'>
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className='min-w-0 whitespace-pre-wrap text-sm leading-6 text-slate-800'>
                        {dialogue.text}
                      </p>
                    )}

                    <div className='flex items-center justify-end gap-3 md:pt-1'>
                      {!isEditing ? (
                        <button
                          type='button'
                          disabled={isPending || timelineId !== null}
                          onClick={() => beginEditing(dialogue.stableId)}
                          className='text-xs font-semibold text-slate-500 transition hover:text-slate-950 disabled:opacity-40'>
                          编辑
                        </button>
                      ) : null}
                      {!isEditing ? (
                        <button
                          type='button'
                          disabled={isPending || editingId !== null}
                          onClick={() => toggleTimelineEditor(dialogue.stableId)}
                          className='text-xs font-semibold text-slate-500 transition hover:text-slate-950 disabled:opacity-40'>
                          {isTimelineEditing ? '收起' : '调整'}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {isTimelineEditing && parsedTimeline ? (
                    <div
                      ref={timelineRootRef}
                      tabIndex={0}
                      onKeyDown={handleTimelineKeyDown}
                      onMouseDown={handleTimelineRootMouseDown}
                      className='mt-4 border-t border-slate-100 pt-4 outline-none focus-visible:ring-2 focus-visible:ring-slate-200'>
                      <TimelineWaveform
                        src={audio.src}
                        start={
                          Number.isFinite(parsedTimeline.start)
                            ? parsedTimeline.start
                            : dialogue.start
                        }
                        end={
                          Number.isFinite(parsedTimeline.end)
                            ? parsedTimeline.end
                            : dialogue.end
                        }
                        duration={audio.duration}
                        currentTime={audio.currentTime}
                        activeBoundary={activeBoundary}
                        onBoundaryFocus={setActiveBoundary}
                        onBoundaryChange={setNumericBoundary}
                        onKeyboardAdjust={nudgeBoundary}
                        onPlayPause={() => {
                          if (!timelinePlaybackError) {
                            audio.toggleRange(
                              dialogue.stableId,
                              parsedTimeline.start,
                              parsedTimeline.end,
                            )
                          }
                        }}
                        onSeek={audio.seek}
                      />

                      <div className='mt-4 grid gap-3 sm:grid-cols-2'>
                        <TimeAdjuster
                          label='Start'
                          value={timelineDraft.start}
                          disabled={isPending}
                          onChange={value => setDraftBoundary('start', value)}
                          onFocus={() => setActiveBoundary('start')}
                          onNudge={delta => nudgeBoundary('start', delta)}
                        />
                        <TimeAdjuster
                          label='End'
                          value={timelineDraft.end}
                          disabled={isPending}
                          onChange={value => setDraftBoundary('end', value)}
                          onFocus={() => setActiveBoundary('end')}
                          onNudge={delta => nudgeBoundary('end', delta)}
                        />
                      </div>

                      {timelineError ? (
                        <p className='mt-3 text-xs font-semibold text-rose-600'>
                          {timelineError}
                        </p>
                      ) : null}
                      {timelineDirty && !timelineError ? (
                        <p className='mt-3 text-xs font-semibold text-amber-700'>
                          当前行时间轴未保存。
                        </p>
                      ) : null}
                      {timelineDurationPending && timelineDirty ? (
                        <p className='mt-1 text-xs text-slate-400'>
                          正在读取音频长度，请稍后保存。
                        </p>
                      ) : null}
                      {overlapWarnings.previous > 0 ? (
                        <p className='mt-2 text-xs font-semibold text-amber-700'>
                          与上一片段重叠 {formatSeconds(overlapWarnings.previous)} 秒
                        </p>
                      ) : null}
                      {overlapWarnings.next > 0 ? (
                        <p className='mt-1 text-xs font-semibold text-amber-700'>
                          与下一片段重叠 {formatSeconds(overlapWarnings.next)} 秒
                        </p>
                      ) : null}

                      <div className='mt-4 flex flex-wrap items-center gap-2'>
                        <button
                          type='button'
                          disabled={Boolean(timelinePlaybackError) || !audio.src || isPending}
                          onClick={() => {
                            if (parsedTimeline) {
                              audio.toggleRange(
                                dialogue.stableId,
                                parsedTimeline.start,
                                parsedTimeline.end,
                              )
                            }
                          }}
                          className='ui-btn ui-btn-sm'>
                          {isPlayingRow ? 'Ⅱ 整段' : '▶ 整段'}
                        </button>
                        <button
                          type='button'
                          disabled={Boolean(timelinePlaybackError) || !audio.src || isPending}
                          onClick={() => playBoundaryPreview('start')}
                          className='ui-btn ui-btn-sm'>
                          ▶ 试听开头
                        </button>
                        <button
                          type='button'
                          disabled={Boolean(timelinePlaybackError) || !audio.src || isPending}
                          onClick={() => playBoundaryPreview('end')}
                          className='ui-btn ui-btn-sm'>
                          ▶ 试听结尾
                        </button>
                      </div>
                      <p className='mt-3 text-[11px] text-slate-400'>
                        ← → 0.01 秒 · Shift + ← → 0.1 秒 · Space 播放/暂停
                      </p>
                      <div className='mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3'>
                        <button
                          type='button'
                          disabled={isPending}
                          onClick={() => {
                            audio.pause()
                            setTimelineId(null)
                          }}
                          className='ui-btn ui-btn-sm disabled:opacity-50'>
                          取消
                        </button>
                        <button
                          type='button'
                          disabled={
                            Boolean(timelineError) ||
                            timelineDurationPending ||
                            !timelineDirty ||
                            isPending
                          }
                          onClick={saveTimeline}
                          className='ui-btn ui-btn-sm ui-btn-primary disabled:opacity-50'>
                          {isPending ? '保存中…' : '保存时间'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
        </div>
        {message && editingId === null ? (
          <p
            className={`border-t border-slate-100 px-5 py-3 text-xs font-semibold md:px-6 ${
              messageTone === 'error' ? 'text-rose-600' : 'text-emerald-700'
            }`}>
            {message}
          </p>
        ) : null}
      </div>
    </details>
  )
}
