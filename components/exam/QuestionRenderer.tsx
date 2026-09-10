'use client'

import React, { useRef } from 'react'
import Image from 'next/image'
import { StandardQuestion } from './question-renderer/StandardQuestion'
import { OptionsList } from './question-renderer/OptionsList'
import { annotateExamText } from './question-renderer/annotate'
import { buildReadingPassageParts } from './question-renderer/readingPassage'
import { ListeningTranscript } from './question-renderer/ListeningTranscript'
import { WrongQuestionBadge } from './question-renderer/WrongQuestionBadge'
import type {
  ExamAnnotationSettings,
  ExamQuestion,
  OnSelectOption,
} from './question-renderer/types'
import { formatMediaTime } from '@/utils/time/format'
import { normalizeQuestionDisplayText } from '@/modules/practice/domain/question-text'

type QuestionRendererProps = {
  question: ExamQuestion
  allQuestions?: ExamQuestion[]
  currentAnswer?: string
  currentSortingOrder?: Array<string | null>
  answerMap?: Record<string, string>
  onSelect: OnSelectOption
  onClear?: () => void
  onSortingOrderChange?: (order: Array<string | null>) => void
  onSelectQuestion?: (questionId: string, optionId: string) => void
  isSubmitted?: boolean
  isInteractionLocked?: boolean
  submittedQuestionIds?: string[]
  wrongQuestionIds?: string[]
  questionNumberMap?: Record<string, number>
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
  isInteractionLocked = isSubmitted,
  submittedQuestionIds = [],
  wrongQuestionIds = [],
  isJapanesePaper = false,
  annotation,
}: QuestionRendererProps) {
  const passageId = question.passageId || question.passage?.id
  const relatedFillBlankQuestions = allQuestions
    .filter(
      item =>
        Boolean(passageId) &&
        (item.passageId || item.passage?.id) === passageId &&
        (item.questionType === 'FILL_BLANK' ||
          item.questionType === 'TOEIC_TEXT_COMPLETION'),
    )
    .sort((a, b) => (a.order || 0) - (b.order || 0))
  const passageParts = buildReadingPassageParts({
    question,
    fillBlankQuestions: relatedFillBlankQuestions,
    answerMap,
    submittedQuestionIds,
    annotation,
  })
  const readingInlineAnnotation = { ...annotation, showMeaning: false }

  return (
    <div className='mx-auto flex w-full flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.85fr)_minmax(340px,0.9fr)] lg:gap-7 lg:items-start'>
      <section className='custom-scrollbar relative w-full overflow-y-auto py-2 md:py-3 lg:max-h-[82vh]'>
        <article
          data-source-type='ARTICLE_TEXT'
          data-source-id={question.passage?.id || question.passageId || ''}
          data-context-block='true'
          data-context-role='reading-passage'
          className={`reading-passage-body mx-auto max-w-[88ch] whitespace-pre-wrap text-[1.12rem] leading-[2.08] text-slate-700 md:text-[1.2rem] md:leading-[2.15] ${
            isJapanesePaper ? 'exam-japanese-text' : ''
          }`}
          dangerouslySetInnerHTML={{
            __html: `${passageParts.bodyHtml}${passageParts.footnotesHtml}${passageParts.annotationsHtml}`,
          }}
        />
      </section>

      <aside className='custom-scrollbar w-full overflow-y-auto lg:sticky lg:top-24 lg:max-h-[82vh]'>
        <div className='mx-auto w-full max-w-xl'>
          <StandardQuestion
            question={question}
            currentAnswer={currentAnswer}
            onSelect={onSelect}
            isSubmitted={isSubmitted}
            isInteractionLocked={isInteractionLocked}
            isWrongReview={wrongQuestionIds.includes(question.id)}
            isJapanesePaper={isJapanesePaper}
            annotation={readingInlineAnnotation}
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
  answerMap = {},
  onSelect,
  onSelectQuestion,
  isSubmitted = false,
  isInteractionLocked = isSubmitted,
  submittedQuestionIds = [],
  wrongQuestionIds = [],
  questionNumberMap = {},
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
  const lessonQuestions = allQuestions.filter(
    item => (item.lessonId || item.lesson?.id) === lessonId,
  )
  const displayedQuestions =
    lessonQuestions.length > 0 ? lessonQuestions : [question]
  const hasPhotograph = displayedQuestions.some(item => Boolean(item.imageUrl))

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
    <div
      className={`mx-auto w-full max-w-4xl ${hasPhotograph ? 'py-1 md:py-2' : 'py-5 md:py-8'}`}>
      {question.lesson?.audioFile && (
        <div
          className={hasPhotograph ? 'mb-3 py-2' : 'mb-5 py-3 md:py-4'}>
          <div className='flex items-center gap-3'>
            <button
              type='button'
              onClick={togglePlayback}
              className='inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-100'>
              {isPlaying ? '暂停' : '播放'}
            </button>
            <div className='min-w-0 flex-1'>
              <div className='mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-500'>
                <span>音频</span>
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
            data-practice-audio='current'
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

      <div className={displayedQuestions.length > 1 ? 'divide-y divide-slate-200' : ''}>
        {displayedQuestions.map((item, index) => {
          const displayNumber = questionNumberMap[item.id] || index + 1
          const itemPrompt = normalizeQuestionDisplayText(item.prompt)
          const itemContext = normalizeQuestionDisplayText(item.contextSentence)
          const itemDistinctContext =
            itemContext === itemPrompt ? null : itemContext
          const itemSubmitted = submittedQuestionIds.includes(item.id)
          const itemIsWrong = wrongQuestionIds.includes(item.id)
          return (
            <section
              key={item.id}
              data-question-id={item.id}
              className='py-5 first:pt-0 last:pb-0'>
              {displayedQuestions.length > 1 || itemIsWrong ? (
                <div className='mb-3 flex min-h-6 items-center justify-between gap-3'>
                  {displayedQuestions.length > 1 ? (
                    <p className='text-xs font-bold text-slate-400'>
                      第 {displayNumber} 题
                    </p>
                  ) : (
                    <span />
                  )}
                  {itemIsWrong ? <WrongQuestionBadge /> : null}
                </div>
              ) : null}
              {item.imageUrl ? (
                <figure className='mb-2 overflow-hidden'>
                  <Image
                    src={item.imageUrl}
                    alt={`第 ${displayNumber} 题题目图片`}
                    width={1200}
                    height={800}
                    unoptimized
                    priority={index === 0}
                    className='mx-auto h-auto max-h-[48vh] w-auto max-w-full object-contain'
                  />
                </figure>
              ) : null}
              {itemPrompt ? (
                <p
                  data-source-type='QUIZ_QUESTION'
                  data-source-id={item.id}
                  data-context-block='true'
                  data-context-role='question-prompt'
                  className={`mb-3 font-medium text-slate-500 ${
                    isJapanesePaper ? 'exam-japanese-text' : ''
                  }`}
                  dangerouslySetInnerHTML={{
                    __html: annotateExamText({
                      text: itemPrompt,
                      settings: annotation,
                    }),
                  }}
                />
              ) : null}
              {itemDistinctContext ? (
                <div
                  data-source-type='AUDIO_DIALOGUE'
                  data-source-id={item.lessonId || dialogueSourceId}
                  data-context-block='true'
                  data-context-role='listening-dialogue'
                  className={`mb-6 text-xl font-medium leading-relaxed text-slate-900 ${
                    isJapanesePaper ? 'exam-japanese-text' : ''
                  }`}
                  dangerouslySetInnerHTML={{
                    __html: annotateExamText({
                      text: itemDistinctContext,
                      settings: annotation,
                    }),
                  }}
                />
              ) : null}
              <OptionsList
                options={item.options || []}
                currentAnswer={
                  answerMap[item.id] ||
                  (item.id === question.id ? currentAnswer : undefined)
                }
                onSelect={optionId =>
                  onSelectQuestion
                    ? onSelectQuestion(item.id, optionId)
                    : onSelect(optionId)
                }
                sourceId={item.id}
                isSubmitted={
                  itemSubmitted ||
                  (displayedQuestions.length === 1 && isSubmitted)
                }
                isInteractionLocked={isInteractionLocked}
                isJapanesePaper={isJapanesePaper}
                optionLabelFormat={item.optionLabelFormat}
                customOptionLabels={item.customOptionLabels}
                compact={Boolean(item.imageUrl)}
                annotation={annotation}
              />
            </section>
          )
        })}
      </div>

      {(isSubmitted ||
        displayedQuestions.some(item =>
          submittedQuestionIds.includes(item.id),
        )) &&
        dialogues.length > 0 && (
          <ListeningTranscript
            lessonId={lessonId}
            dialogues={dialogues}
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
  currentSortingOrder,
  answerMap,
  onSelect,
  onClear,
  onSortingOrderChange,
  onSelectQuestion,
  isSubmitted = false,
  isInteractionLocked = isSubmitted,
  submittedQuestionIds = [],
  wrongQuestionIds = [],
  questionNumberMap = {},
  isJapanesePaper = false,
  annotation,
}: QuestionRendererProps) {
  if (!question) {
    return <div className='p-10 text-center text-gray-500'>加载题目失败...</div>
  }

  if (question.passageId || question.passage?.id) {
    return (
      <ReadingQuestion
        question={question}
        allQuestions={allQuestions}
        currentAnswer={currentAnswer}
        answerMap={answerMap}
        onSelect={onSelect}
        onSelectQuestion={onSelectQuestion}
        isSubmitted={isSubmitted}
        isInteractionLocked={isInteractionLocked}
        submittedQuestionIds={submittedQuestionIds}
        wrongQuestionIds={wrongQuestionIds}
        questionNumberMap={questionNumberMap}
        isJapanesePaper={isJapanesePaper}
        annotation={annotation}
      />
    )
  }

  if (question.lessonId || question.lesson?.id) {
    return (
      <ListeningQuestion
        question={question}
        allQuestions={allQuestions}
        currentAnswer={currentAnswer}
        answerMap={answerMap}
        onSelect={onSelect}
        onSelectQuestion={onSelectQuestion}
        isSubmitted={isSubmitted}
        isInteractionLocked={isInteractionLocked}
        submittedQuestionIds={submittedQuestionIds}
        wrongQuestionIds={wrongQuestionIds}
        questionNumberMap={questionNumberMap}
        isJapanesePaper={isJapanesePaper}
        annotation={annotation}
      />
    )
  }

  return (
    <StandardQuestion
      question={question}
      currentAnswer={currentAnswer}
      currentSortingOrder={currentSortingOrder}
      onSelect={onSelect}
      onClear={onClear}
      onSortingOrderChange={onSortingOrderChange}
      isSubmitted={isSubmitted}
      isInteractionLocked={isInteractionLocked}
      isWrongReview={wrongQuestionIds.includes(question.id)}
      isJapanesePaper={isJapanesePaper}
      annotation={annotation}
    />
  )
}
