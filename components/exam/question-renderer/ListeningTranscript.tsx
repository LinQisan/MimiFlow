'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { annotateExamText } from './annotate'
import type { ExamAnnotationSettings, ExamQuestion } from './types'

type DialogueLine =
  NonNullable<NonNullable<ExamQuestion['lesson']>['dialogues']>[number]

type ListeningTranscriptProps = {
  lessonId: string
  dialogues: DialogueLine[]
  audioRef: React.RefObject<HTMLAudioElement | null>
  annotation: ExamAnnotationSettings
}

const formatTime = (sec: number) => {
  if (!Number.isFinite(sec)) return '00:00'
  const total = Math.max(0, Math.floor(sec))
  const m = String(Math.floor(total / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')
  return `${m}:${s}`
}

export function ListeningTranscript({
  lessonId,
  dialogues,
  audioRef,
  annotation,
}: ListeningTranscriptProps) {
  const [activeLineId, setActiveLineId] = useState<number | null>(null)

  const sortedDialogues = useMemo(
    () =>
      [...dialogues].sort(
        (a, b) => a.start - b.start || (a.sequenceId || 0) - (b.sequenceId || 0),
      ),
    [dialogues],
  )

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || sortedDialogues.length === 0) return

    const syncActive = () => {
      const currentTime = audio.currentTime
      const line = sortedDialogues.find(
        item => currentTime >= item.start && currentTime <= item.end,
      )
      setActiveLineId(line?.id ?? null)
    }

    const onEnded = () => setActiveLineId(null)

    audio.addEventListener('timeupdate', syncActive)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', syncActive)
      audio.removeEventListener('ended', onEnded)
    }
  }, [audioRef, sortedDialogues])

  const handleLineClick = (line: DialogueLine) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = line.start
    audio.play().catch(() => {})
  }

  return (
    <div className='mt-6 rounded-2xl border border-gray-100 bg-white/80 p-4 shadow-sm md:p-5'>
      <div className='mb-3 flex items-center justify-between'>
        <h3 className='text-sm font-bold text-gray-800'>听力原文（交卷后可查看）</h3>
        <span className='text-xs text-gray-400'>点击句子跳播</span>
      </div>

      <div className='custom-scrollbar max-h-[45vh] space-y-2 overflow-y-auto pr-1'>
        {sortedDialogues.map(line => {
          const isActive = activeLineId === line.id
          return (
            <button
              key={`dialogue-${lessonId}-${line.id}`}
              type='button'
              onClick={() => handleLineClick(line)}
              data-source-type='AUDIO_DIALOGUE'
              data-source-id={String(line.id)}
              data-context-block='true'
              data-context-role='listening-dialogue-line'
              className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                isActive
                  ? 'border-indigo-300 bg-indigo-50'
                  : 'border-gray-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/40'
              }`}>
              <div className='mb-1 text-[11px] font-medium text-gray-400'>
                {formatTime(line.start)} - {formatTime(line.end)}
              </div>
              <div
                className='text-[15px] leading-7 text-gray-800'
                dangerouslySetInnerHTML={{
                  __html: annotateExamText({ text: line.text, settings: annotation }),
                }}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
