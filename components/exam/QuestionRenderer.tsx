'use client'

import React, { useRef } from 'react'
import { StandardQuestion } from './question-renderer/StandardQuestion'
import { OptionsList } from './question-renderer/OptionsList'
import { annotateExamText } from './question-renderer/annotate'
import { buildReadingPassageHtml } from './question-renderer/readingPassage'
import { ListeningTranscript } from './question-renderer/ListeningTranscript'
import type {
  ExamAnnotationSettings,
  ExamQuestion,
  OnSelectOption,
} from './question-renderer/types'
import { formatMediaTime } from '@/utils/time/format'

type QuestionRendererProps = {
  question: ExamQuestion
  allQuestions?: ExamQuestion[]
  currentAnswer?: string
  answerMap?: Record<string, string>
  onSelect: OnSelectOption
  isSubmitted?: boolean
  isJapanesePaper?: boolean
  annotation: ExamAnnotationSettings
}

function ReadingQuestion({
  question,
  allQuestions = [],
  currentAnswer,
  answerMap = {},
  onSelect,
  isSubmitted = false,
  isJapanesePaper = false,
  annotation,
}: QuestionRendererProps) {
  const relatedFillBlankQuestions = allQuestions
    .filter(
      item =>
        item.passageId === question.passageId &&
        item.questionType === 'FILL_BLANK',
    )
    .sort((a, b) => (a.order || 0) - (b.order || 0))

  return (
    <div className='mx-auto w-full flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(360px,1fr)] lg:items-start'>
      <section className='custom-scrollbar relative w-full overflow-y-auto rounded-[20px] bg-white p-6 shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)] md:p-8 lg:max-h-[78vh]'>
        <article
          data-source-type='ARTICLE_TEXT'
          data-source-id={question.passage?.id || ''}
          data-context-block='true'
          data-context-role='reading-passage'
          className={`reading-passage-body mx-auto max-w-[76ch] whitespace-pre-wrap text-[1.12rem] leading-[2.08] text-slate-700 md:text-[1.2rem] md:leading-[2.15] ${
            isJapanesePaper ? 'exam-japanese-text' : ''
          }`}
          dangerouslySetInnerHTML={{
            __html: buildReadingPassageHtml({
              question,
              fillBlankQuestions: relatedFillBlankQuestions,
              answerMap,
              isSubmitted,
              annotation,
            }),
          }}
        />
      </section>

      <aside className='custom-scrollbar w-full overflow-y-auto rounded-[20px] bg-slate-50 p-4 shadow-[inset_0_1px_1px_rgba(15,23,42,0.06)] md:p-5 lg:sticky lg:top-24 lg:max-h-[78vh]'>
        <div className='mx-auto w-full max-w-xl'>
          <div className='mb-3 border-b border-slate-200 pb-2'>
            <p className='text-xs font-bold tracking-[0.18em] text-slate-500'>
              作答面板
            </p>
          </div>
          <StandardQuestion
            question={question}
            currentAnswer={currentAnswer}
            onSelect={onSelect}
            isSubmitted={isSubmitted}
            isJapanesePaper={isJapanesePaper}
            annotation={annotation}
          />
        </div>
      </aside>
    </div>
  )
}

function ListeningQuestion({
  question,
  allQuestions = [],
  currentAnswer,
  onSelect,
  isSubmitted = false,
  isJapanesePaper = false,
  annotation,
}: QuestionRendererProps) {
  const dialogueSourceId = question.lessonId || question.id
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = React.useState(false)
  const [currentTime, setCurrentTime] = React.useState(0)
  const [duration, setDuration] = React.useState(0)
  const [autoPlayAttempted, setAutoPlayAttempted] = React.useState(false)
  const dialogues = question.lesson?.dialogues || []
  const lessonId = question.lesson?.id || question.lessonId || question.id
  const sectionKey = question.lesson?.sectionKey || ''
  const sectionQuestions = sectionKey
    ? allQuestions.filter(item => item.lesson?.sectionKey === sectionKey)
    : []
  const sectionQuestionIndex = Math.max(
    0,
    sectionQuestions.findIndex(item => item.id === question.id),
  )
  const sectionTitle = question.lesson?.sectionTitle || '听力部分'

  React.useEffect(() => {
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setAutoPlayAttempted(false)
  }, [lessonId, question.lesson?.audioFile])

  React.useEffect(() => {
    const audio = audioRef.current
    if (!audio || !question.lesson?.audioFile) return

    const syncTime = () => setCurrentTime(audio.currentTime || 0)
    const syncDuration = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    }
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => {
      setIsPlaying(false)
      setCurrentTime(audio.duration || 0)
    }

    const tryAutoplay = () => {
      if (autoPlayAttempted) return
      setAutoPlayAttempted(true)
      audio.play().catch(() => {})
    }

    audio.addEventListener('loadedmetadata', syncDuration)
    audio.addEventListener('timeupdate', syncTime)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('canplay', tryAutoplay)

    syncDuration()
    syncTime()
    tryAutoplay()

    return () => {
      audio.removeEventListener('loadedmetadata', syncDuration)
      audio.removeEventListener('timeupdate', syncTime)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('canplay', tryAutoplay)
    }
  }, [autoPlayAttempted, lessonId, question.lesson?.audioFile])

  const togglePlayback = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) audio.play().catch(() => {})
    else audio.pause()
  }

  const handleSeek = (value: number) => {
    const audio = audioRef.current
    if (!audio || !Number.isFinite(value)) return
    audio.currentTime = value
    setCurrentTime(value)
  }

  return (
    <div className='mx-auto w-full max-w-3xl rounded-[20px] bg-white p-6 shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)] md:p-8'>
      <div className='mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4'>
        <div>
          <div className='inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700'>
            {sectionTitle}
          </div>
          {sectionQuestions.length > 1 && (
            <p className='mt-2 text-sm font-medium text-slate-500'>
              本部分第 {sectionQuestionIndex + 1} / {sectionQuestions.length} 题。每段音频对应一道题。
            </p>
          )}
        </div>
        {question.lesson?.audioFile && (
          <span className='rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500'>
            单题音频
          </span>
        )}
      </div>

      {question.lesson?.audioFile && (
        <div className='mb-6 rounded-[18px] border border-slate-200 bg-slate-50 p-4 shadow-[inset_0_1px_1px_rgba(15,23,42,0.06)] md:p-5'>
          <div className='flex items-center gap-3'>
            <button
              type='button'
              onClick={togglePlayback}
              className='inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-100'>
              {isPlaying ? '暂停' : '播放'}
            </button>
            <div className='min-w-0 flex-1'>
              <div className='mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-500'>
                <span>听力播放</span>
                <span>
                  {formatMediaTime(currentTime)} / {formatMediaTime(duration)}
                </span>
              </div>
              <input
                type='range'
                min={0}
                max={Math.max(duration, 0)}
                step='0.1'
                value={Math.min(currentTime, duration || currentTime)}
                onChange={e => handleSeek(Number(e.target.value))}
                className='h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-slate-900 outline-none'
                aria-label='音频进度'
              />
            </div>
          </div>
          <audio
            ref={audioRef}
            autoPlay
            playsInline
            preload='auto'
            className='hidden'
            src={question.lesson.audioFile}
            controlsList='nodownload'>
            您的浏览器不支持音频播放。
          </audio>
        </div>
      )}

      {question.prompt && (
        <p
          data-source-type='QUIZ_QUESTION'
          data-source-id={question.id}
          data-context-block='true'
          data-context-role='question-prompt'
          className={`mb-3 font-medium text-slate-500 ${
            isJapanesePaper ? 'exam-japanese-text' : ''
          }`}
          dangerouslySetInnerHTML={{
            __html: annotateExamText({
              text: question.prompt,
              settings: annotation,
            }),
          }}
        />
      )}

      {question.contextSentence && (
        <div
          data-source-type='AUDIO_DIALOGUE'
          data-source-id={dialogueSourceId}
          data-context-block='true'
          data-context-role='listening-dialogue'
          className={`mb-6 text-xl font-medium leading-relaxed text-slate-900 ${
            isJapanesePaper ? 'exam-japanese-text' : ''
          }`}
          dangerouslySetInnerHTML={{
            __html: annotateExamText({
              text: question.contextSentence,
              settings: annotation,
            }),
          }}
        />
      )}

      {!question.prompt && !question.contextSentence && (
        <p className='mb-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-500'>
          该听力题未填写文字题干，作答时只显示选项。
        </p>
      )}

      <OptionsList
        options={question.options || []}
        currentAnswer={currentAnswer}
        onSelect={onSelect}
        sourceId={question.id}
        isSubmitted={isSubmitted}
        isJapanesePaper={isJapanesePaper}
        annotation={annotation}
      />

      {isSubmitted && dialogues.length > 0 && (
        <ListeningTranscript
          lessonId={lessonId}
          dialogues={dialogues}
          options={question.options || []}
          audioRef={audioRef}
          annotation={annotation}
        />
      )}
    </div>
  )
}

export function QuestionRenderer({
  question,
  allQuestions,
  currentAnswer,
  answerMap,
  onSelect,
  isSubmitted = false,
  isJapanesePaper = false,
  annotation,
}: QuestionRendererProps) {
  if (!question) {
    return <div className='p-10 text-center text-gray-500'>加载题目失败...</div>
  }

  if (question.passageId) {
    return (
      <ReadingQuestion
        question={question}
        allQuestions={allQuestions}
        currentAnswer={currentAnswer}
        answerMap={answerMap}
        onSelect={onSelect}
        isSubmitted={isSubmitted}
        isJapanesePaper={isJapanesePaper}
        annotation={annotation}
      />
    )
  }

  if (question.lessonId) {
    return (
      <ListeningQuestion
        question={question}
        allQuestions={allQuestions}
        currentAnswer={currentAnswer}
        answerMap={answerMap}
        onSelect={onSelect}
        isSubmitted={isSubmitted}
        isJapanesePaper={isJapanesePaper}
        annotation={annotation}
      />
    )
  }

  return (
    <StandardQuestion
      question={question}
      currentAnswer={currentAnswer}
      onSelect={onSelect}
      isSubmitted={isSubmitted}
      isJapanesePaper={isJapanesePaper}
      annotation={annotation}
    />
  )
}
