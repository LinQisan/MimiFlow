'use client'

import { useCallback, useEffect, useRef } from 'react'

import { clampTime, formatTimingTime } from '../domain/audio-timing'
import type { SubtitleLine, WaveformClickMode } from '../domain/audio-timing'

type DragMode = 'start' | 'end' | 'range'

export function WaveformCanvas({
  peaks,
  duration,
  currentTime,
  lines,
  pendingStart,
  draftStart,
  draftEnd,
  clickMode,
  viewStart,
  windowSeconds,
  onSeek,
  onDraftRangeChange,
  onClickModeChange,
}: {
  peaks: number[]
  duration: number
  currentTime: number
  lines: SubtitleLine[]
  pendingStart: number | null
  draftStart: number
  draftEnd: number
  clickMode: WaveformClickMode
  viewStart: number
  windowSeconds: number
  onSeek: (time: number) => void
  onDraftRangeChange: (start: number, end: number) => void
  onClickModeChange: (mode: WaveformClickMode) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{
    mode: DragMode
    startX: number
    startDraftStart: number
    startDraftEnd: number
  } | null>(null)
  const viewEnd = Math.min(duration, viewStart + windowSeconds)
  const visibleDuration = Math.max(0.01, viewEnd - viewStart)

  const timeToX = useCallback(
    (time: number, width: number) =>
      ((time - viewStart) / visibleDuration) * width,
    [viewStart, visibleDuration],
  )

  const clientXToTime = (clientX: number, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const ratio = (clientX - rect.left) / rect.width
    return clampTime(viewStart + visibleDuration * ratio, duration)
  }

  const normalizeDraftRange = (start: number, end: number) => {
    const safeStart = clampTime(start, duration)
    const safeEnd = clampTime(end, duration)
    if (safeEnd <= safeStart) {
      return {
        start: Math.max(0, safeStart - 0.05),
        end: Math.min(duration || safeStart + 0.05, safeStart + 0.05),
      }
    }
    return { start: safeStart, end: safeEnd }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.floor(rect.width * ratio))
    canvas.height = Math.max(1, Math.floor(rect.height * ratio))

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(ratio, ratio)
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, rect.width, rect.height)

    const mid = rect.height / 2
    const barCount = Math.max(1, Math.floor(rect.width / 2))
    const barWidth = rect.width / barCount

    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 1
    for (let i = 0; i < 5; i += 1) {
      const y = (rect.height / 4) * i
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(rect.width, y)
      ctx.stroke()
    }

    for (let index = 0; index < barCount; index += 1) {
      const time = viewStart + (index / barCount) * visibleDuration
      const peakIndex = duration
        ? Math.min(peaks.length - 1, Math.max(0, Math.floor((time / duration) * peaks.length)))
        : 0
      const peak = peaks[peakIndex] || 0
      const height = Math.max(2, peak * (rect.height - 28))
      const x = index * barWidth
      ctx.fillStyle = '#475569'
      ctx.fillRect(x, mid - height / 2, Math.max(1, barWidth * 0.72), height)
    }

    ctx.fillStyle = 'rgba(14, 165, 233, 0.16)'
    for (const line of lines) {
      if (line.end < viewStart || line.start > viewEnd) continue
      const start = Math.max(line.start, viewStart)
      const end = Math.min(line.end, viewEnd)
      const x = ((start - viewStart) / visibleDuration) * rect.width
      const width = Math.max(2, ((end - start) / visibleDuration) * rect.width)
      ctx.fillRect(x, 0, width, rect.height)
    }

    if (draftEnd > draftStart && draftEnd >= viewStart && draftStart <= viewEnd) {
      const rangeStart = Math.max(draftStart, viewStart)
      const rangeEnd = Math.min(draftEnd, viewEnd)
      const startX = timeToX(rangeStart, rect.width)
      const endX = timeToX(rangeEnd, rect.width)
      const width = Math.max(2, endX - startX)
      ctx.fillStyle = 'rgba(249, 115, 22, 0.18)'
      ctx.fillRect(startX, 0, width, rect.height)
      ctx.strokeStyle = '#f97316'
      ctx.lineWidth = 2
      ctx.strokeRect(startX, 1, width, rect.height - 2)

      ctx.fillStyle = '#f97316'
      ctx.fillRect(startX - 3, 0, 6, rect.height)
      ctx.fillRect(endX - 3, 0, 6, rect.height)
      ctx.fillStyle = '#fff7ed'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(formatTimingTime(draftStart), startX + 8, 18)
      ctx.textAlign = 'right'
      ctx.fillText(formatTimingTime(draftEnd), endX - 8, 18)
    }

    if (pendingStart !== null && pendingStart >= viewStart && pendingStart <= viewEnd) {
      const x = ((pendingStart - viewStart) / visibleDuration) * rect.width
      ctx.strokeStyle = '#f97316'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, rect.height)
      ctx.stroke()
    }

    if (currentTime >= viewStart && currentTime <= viewEnd) {
      const playheadX = ((currentTime - viewStart) / visibleDuration) * rect.width
      ctx.strokeStyle = '#dc2626'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(playheadX, 0)
      ctx.lineTo(playheadX, rect.height)
      ctx.stroke()
    }

    ctx.fillStyle = '#334155'
    ctx.font = '12px sans-serif'
    ctx.fillText(formatTimingTime(viewStart), 10, rect.height - 10)
    ctx.textAlign = 'right'
    ctx.fillText(formatTimingTime(viewEnd), rect.width - 10, rect.height - 10)
  }, [
    currentTime,
    draftEnd,
    draftStart,
    duration,
    lines,
    peaks,
    pendingStart,
    viewEnd,
    viewStart,
    visibleDuration,
    timeToX,
  ])

  const resolveDragMode = (clientX: number, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const startX = timeToX(draftStart, rect.width)
    const endX = timeToX(draftEnd, rect.width)
    const x = clientX - rect.left
    const handleHit = 10

    if (Math.abs(x - startX) <= handleHit) return 'start' as const
    if (Math.abs(x - endX) <= handleHit) return 'end' as const
    if (x > startX && x < endX) return 'range' as const
    return null
  }

  const applyPointerTime = (clientX: number, canvas: HTMLCanvasElement) => {
    const time = clientXToTime(clientX, canvas)
    const { start, end } = normalizeDraftRange(draftStart, draftEnd)

    if (clickMode === 'start') {
      onDraftRangeChange(Math.min(time, end - 0.05), end)
      onSeek(time)
      return
    }

    if (clickMode === 'end') {
      onDraftRangeChange(start, Math.max(time, start + 0.05))
      onSeek(time)
      return
    }

    onSeek(time)
  }

  return (
    <canvas
      ref={canvasRef}
      className='h-64 w-full touch-none cursor-crosshair border border-slate-200 bg-slate-50'
      onPointerDown={event => {
        if (!duration) return
        const canvas = event.currentTarget
        const dragMode = resolveDragMode(event.clientX, canvas)

        if (dragMode) {
          dragRef.current = {
            mode: dragMode,
            startX: event.clientX,
            startDraftStart: draftStart,
            startDraftEnd: draftEnd,
          }
          canvas.setPointerCapture(event.pointerId)
          return
        }

        applyPointerTime(event.clientX, canvas)
        if (clickMode !== 'seek') onClickModeChange('seek')
      }}
      onPointerMove={event => {
        const drag = dragRef.current
        const canvas = event.currentTarget
        if (!drag || !duration) {
          const dragMode = resolveDragMode(event.clientX, canvas)
          canvas.style.cursor =
            dragMode === 'start' || dragMode === 'end'
              ? 'ew-resize'
              : dragMode === 'range'
                ? 'grab'
                : clickMode === 'seek'
                  ? 'crosshair'
                  : 'copy'
          return
        }

        const rect = canvas.getBoundingClientRect()
        const deltaSeconds = ((event.clientX - drag.startX) / rect.width) * visibleDuration

        if (drag.mode === 'start') {
          const nextStart = Math.min(
            drag.startDraftStart + deltaSeconds,
            drag.startDraftEnd - 0.05,
          )
          onDraftRangeChange(clampTime(nextStart, duration), drag.startDraftEnd)
          return
        }

        if (drag.mode === 'end') {
          const nextEnd = Math.max(
            drag.startDraftEnd + deltaSeconds,
            drag.startDraftStart + 0.05,
          )
          onDraftRangeChange(drag.startDraftStart, clampTime(nextEnd, duration))
          return
        }

        const rangeLength = drag.startDraftEnd - drag.startDraftStart
        const nextStart = clampTime(drag.startDraftStart + deltaSeconds, duration)
        const clampedStart = Math.min(nextStart, Math.max(0, duration - rangeLength))
        onDraftRangeChange(clampedStart, clampedStart + rangeLength)
      }}
      onPointerUp={event => {
        const canvas = event.currentTarget
        if (dragRef.current) {
          canvas.releasePointerCapture(event.pointerId)
          canvas.style.cursor = 'crosshair'
        }
        dragRef.current = null
      }}
      onPointerCancel={event => {
        const canvas = event.currentTarget
        if (dragRef.current) canvas.releasePointerCapture(event.pointerId)
        dragRef.current = null
      }}
    />
  )
}

export function WaveformOverview({
  peaks,
  duration,
  currentTime,
  viewStart,
  windowSeconds,
  lines,
  onSeek,
}: {
  peaks: number[]
  duration: number
  currentTime: number
  viewStart: number
  windowSeconds: number
  lines: SubtitleLine[]
  onSeek: (time: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.floor(rect.width * ratio))
    canvas.height = Math.max(1, Math.floor(rect.height * ratio))

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(ratio, ratio)
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, rect.width, rect.height)

    const mid = rect.height / 2
    const barCount = Math.max(1, peaks.length)
    const barWidth = rect.width / barCount

    peaks.forEach((peak, index) => {
      const height = Math.max(1, peak * (rect.height - 14))
      const x = index * barWidth
      ctx.fillStyle = '#cbd5e1'
      ctx.fillRect(x, mid - height / 2, Math.max(1, barWidth * 0.75), height)
    })

    ctx.fillStyle = 'rgba(14, 165, 233, 0.22)'
    for (const line of lines) {
      const x = duration ? (line.start / duration) * rect.width : 0
      const width = duration
        ? Math.max(2, ((line.end - line.start) / duration) * rect.width)
        : 0
      ctx.fillRect(x, 0, width, rect.height)
    }

    const viewWidth = duration
      ? Math.max(8, (Math.min(windowSeconds, duration) / duration) * rect.width)
      : 0
    const viewX = duration ? (viewStart / duration) * rect.width : 0
    ctx.strokeStyle = '#2563eb'
    ctx.lineWidth = 2
    ctx.strokeRect(viewX, 2, Math.min(viewWidth, rect.width - viewX), rect.height - 4)

    const playheadX = duration ? (currentTime / duration) * rect.width : 0
    ctx.strokeStyle = '#dc2626'
    ctx.beginPath()
    ctx.moveTo(playheadX, 0)
    ctx.lineTo(playheadX, rect.height)
    ctx.stroke()
  }, [currentTime, duration, lines, peaks, viewStart, windowSeconds])

  return (
    <canvas
      ref={canvasRef}
      className='h-16 w-full cursor-pointer border border-slate-200 bg-slate-50'
      onClick={event => {
        if (!duration) return
        const rect = event.currentTarget.getBoundingClientRect()
        const ratio = (event.clientX - rect.left) / rect.width
        onSeek(clampTime(duration * ratio, duration))
      }}
    />
  )
}

