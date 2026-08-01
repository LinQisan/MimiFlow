'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { annotateExamText } from './annotate'
import type {
  ExamAnnotationSettings,
  ExamQuestion,
  ExamQuestionOption,
} from './types'
import { formatMediaTime } from '@/utils/time/format'
import { buildAudioDialogueSourceId } from '@/utils/audioDialogue/sourceId'

type DialogueLine =
  NonNullable<NonNullable<ExamQuestion['lesson']>['dialogues']>[number]

type ListeningTranscriptProps = {
  lessonId: string
  dialogues: DialogueLine[]
  options?: ExamQuestionOption[]
  audioRef: React.RefObject<HTMLAudioElement | null>
  annotation: ExamAnnotationSettings
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
      [...dialogues]
        .filter(line => (line.text || '').trim())
        .sort(
          (a, b) =>
            a.start - b.start || (a.sequenceId || 0) - (b.sequenceId || 0),
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
    <section className='mt-8 border-t border-slate-200 pt-6'>
      <div className='mb-3 flex items-start justify-between gap-3'>
        <div>
          <h3 className='text-base font-bold tracking-tight text-slate-900'>
            听力原文
          </h3>
          <p className='mt-1 text-xs text-slate-500'>
            共 {sortedDialogues.length} 句 · 点按时间可从该处播放
          </p>
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          <button
            type='button'
            onClick={() => void handleCopyTranscript()}
            disabled={!copyPayload}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
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

      <div className='divide-y divide-slate-100 border-y border-slate-200'>
        {sortedDialogues.map(line => {
          const isActive = activeLineId === line.id
          return (
            <div
              key={`dialogue-${lessonId}-${line.id}`}
              className={`grid w-full grid-cols-[4rem_minmax(0,1fr)] gap-3 px-2 py-3 text-left transition-colors md:grid-cols-[4.75rem_minmax(0,1fr)] md:px-3 ${
                isActive
                  ? 'bg-slate-100'
                  : 'bg-white hover:bg-slate-50'
              }`}>
              <button
                type='button'
                onClick={() => handleLineClick(line)}
                aria-label={`从 ${formatMediaTime(line.start)} 播放`}
                className={`h-fit rounded-md px-1.5 py-1 font-mono text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                }`}>
                {formatMediaTime(line.start)}
              </button>
              <div
                data-source-type='AUDIO_DIALOGUE'
                data-source-id={buildAudioDialogueSourceId(
                  lessonId,
                  String(line.sequenceId || line.id),
                )}
                data-context-block='true'
                data-context-role='listening-dialogue-line'
                className='cursor-text select-text text-[15px] leading-7 text-slate-800 md:text-base md:leading-8'
                dangerouslySetInnerHTML={{
                  __html: annotateExamText({ text: line.text, settings: annotation }),
                }}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}
