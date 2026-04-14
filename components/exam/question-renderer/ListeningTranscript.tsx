'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { annotateExamText } from './annotate'
import type {
  ExamAnnotationSettings,
  ExamQuestion,
  ExamQuestionOption,
} from './types'

type DialogueLine =
  NonNullable<NonNullable<ExamQuestion['lesson']>['dialogues']>[number]

type ListeningTranscriptProps = {
  lessonId: string
  dialogues: DialogueLine[]
  options?: ExamQuestionOption[]
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
  options = [],
  audioRef,
  annotation,
}: ListeningTranscriptProps) {
  const [activeLineId, setActiveLineId] = useState<number | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>(
    'idle',
  )

  const sortedDialogues = useMemo(
    () =>
      [...dialogues].sort(
        (a, b) => a.start - b.start || (a.sequenceId || 0) - (b.sequenceId || 0),
    ),
    [dialogues],
  )

  const transcriptText = useMemo(
    () =>
      sortedDialogues
        .map(line => (line.text || '').trim())
        .filter(Boolean)
        .join('\n'),
    [sortedDialogues],
  )

  const optionsText = useMemo(
    () =>
      options
        .map((option, index) => {
          const text = (option.text || '').trim()
          return text ? `${index + 1}. ${text}` : ''
        })
        .filter(Boolean)
        .join('\n'),
    [options],
  )

  const copyPayload = useMemo(() => {
    const sections: string[] = []
    if (transcriptText) {
      sections.push(transcriptText)
    }
    if (optionsText) {
      sections.push(`选项：\n${optionsText}`)
    }
    return sections.join('\n\n').trim()
  }, [optionsText, transcriptText])

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

  const writeClipboard = async (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }

    if (typeof document === 'undefined') {
      throw new Error('clipboard api unavailable')
    }

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(textarea)
    if (!copied) throw new Error('copy fallback failed')
  }

  const handleCopyTranscript = async () => {
    if (!copyPayload) return
    try {
      await writeClipboard(copyPayload)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1800)
    } catch {
      setCopyState('error')
      window.setTimeout(() => setCopyState('idle'), 1800)
    }
  }

  return (
    <div className='mt-6 rounded-[18px] bg-white p-4 shadow-[0_1px_5px_-4px_rgba(15,23,42,0.35),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)] md:p-5'>
      <div className='mb-3 flex items-center justify-between'>
        <h3 className='text-sm font-bold tracking-tight text-slate-900'>
          听力原文（交卷后可查看）
        </h3>
        <div className='flex items-center gap-2'>
          <span className='text-xs text-slate-400'>点击句子跳播</span>
          <button
            type='button'
            onClick={() => void handleCopyTranscript()}
            disabled={!copyPayload}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              copyState === 'copied'
                ? 'border-slate-300 bg-slate-100 text-slate-900'
                : copyState === 'error'
                  ? 'border-rose-300 bg-rose-50 text-rose-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}>
            {copyState === 'copied'
              ? '已复制'
              : copyState === 'error'
                ? '复制失败'
                : '复制原文'}
          </button>
        </div>
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
                  ? 'border-slate-900 bg-slate-100'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
              }`}>
              <div className='mb-1 text-[11px] font-medium text-slate-400'>
                {formatTime(line.start)} - {formatTime(line.end)}
              </div>
              <div
                className='text-[15px] leading-7 text-slate-800'
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
