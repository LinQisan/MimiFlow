'use client'

import styles from './ListeningTranscript.module.css'
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
  audioReady: boolean
  annotation: ExamAnnotationSettings
}

export function ListeningTranscript({
  lessonId,
  dialogues,
  audioRef,
  audioReady,
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
    if (!audio || !audioReady || audio.readyState < 1) return
    audio.currentTime = line.start
    audio.play().catch(() => {})
  }

  return (
    <section className={styles.transcript} aria-label='听力原文'>
      <div className={styles.heading}>
        <h3 className='text-base font-bold tracking-tight text-slate-900'>
          听力原文
        </h3>
        <p className='text-xs text-slate-500'>
          共 {sortedDialogues.length} 句 · 点按时间可从该处播放
        </p>
      </div>

      <div>
        {sortedDialogues.map(line => {
          const isActive = activeLineId === line.id
          return (
            <div
              key={`dialogue-${lessonId}-${line.id}`}
              data-active={isActive}
              className={styles.line}>
              <button
                type='button'
                onClick={() => handleLineClick(line)}
                disabled={!audioReady}
                aria-label={`从 ${formatMediaTime(line.start)} 播放`}
                aria-current={isActive ? 'true' : undefined}
                className={styles.time}>
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
                className={styles.text}
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
