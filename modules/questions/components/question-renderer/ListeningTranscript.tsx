'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { annotateExamText } from './annotate'
import type {
  ExamAnnotationSettings,
  ExamQuestion,
} from './types'
import { formatMediaTime } from '@/utils/time/format'
import { buildAudioDialogueSourceId } from '@/utils/audioDialogue/sourceId'

type DialogueLine =
  NonNullable<NonNullable<ExamQuestion['lesson']>['dialogues']>[number]

type ListeningTranscriptProps = {
  lessonId: string
  dialogues: DialogueLine[]
  audioRef: React.RefObject<HTMLAudioElement | null>
  annotation: ExamAnnotationSettings
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
      [...dialogues]
        .filter(line => (line.text || '').trim())
        .sort(
          (a, b) =>
            a.start - b.start || (a.sequenceId || 0) - (b.sequenceId || 0),
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
    <section className='mt-8 border-t border-slate-200 pt-6'>
      <div className='mb-3'>
        <h3 className='text-base font-bold tracking-tight text-slate-900'>
          听力原文
        </h3>
        <p className='mt-1 text-xs text-slate-500'>
          共 {sortedDialogues.length} 句 · 点按时间可从该处播放
        </p>
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
