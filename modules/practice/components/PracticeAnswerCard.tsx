'use client'

import React from 'react'
import type { ExamQuestion } from '@/modules/questions/components/question-renderer/types'
import type { usePracticeSession } from '@/modules/practice/hooks/usePracticeSession'
import type { buildAnswerCardSections } from '@/modules/practice/domain/answer-card-sections'

type Props = {
  session: ReturnType<typeof usePracticeSession<ExamQuestion>>
  answerCardSections: ReturnType<typeof buildAnswerCardSections>
  questions: ExamQuestion[]
  isSingleMode: boolean
  mode?: 'exam' | 'random' | 'single' | 'history'
  isJapanesePaper: boolean
  historyCorrectQuestionIds: string[]
  historyWrongQuestionIds: string[]
  historyCorrectQuestionIdSet: Set<string>
  historyWrongQuestionIdSet: Set<string>
}

export default function PracticeAnswerCard({
  session,
  answerCardSections,
  questions,
  isSingleMode,
  mode,
  isJapanesePaper,
  historyCorrectQuestionIds,
  historyWrongQuestionIds,
  historyCorrectQuestionIdSet,
  historyWrongQuestionIdSet,
}: Props) {
  if (!session.showSheet || isSingleMode) return null
  return (
    <>
      <button
        type='button'
        aria-label='关闭答题卡'
        onClick={() => session.setShowSheet(false)}
        className='fixed inset-0 z-30 cursor-default bg-slate-900/10 backdrop-blur-[1px]'
      />
      <section
        role='dialog'
        aria-modal='true'
        aria-label='答题卡'
        className='fixed inset-x-3 top-[6.5rem] z-50 mx-auto max-h-[calc(100vh-7.5rem)] max-w-6xl overflow-hidden rounded-xl border border-slate-200 bg-[#f7f7f5] shadow-[0_24px_70px_-28px_rgba(15,23,42,0.55)] md:top-[4.25rem] md:max-h-[calc(100vh-5.25rem)]'>
        <div className='flex items-center justify-between border-b border-slate-200 px-4 py-3 md:px-5'>
          <div>
            <h4 className='text-sm font-bold tracking-tight text-slate-900 md:text-base'>
              答题卡
            </h4>
            <p className='mt-0.5 text-[11px] text-slate-500'>
              {mode === 'history'
                ? `整套 ${questions.length} 题 · 答对 ${historyCorrectQuestionIds.length} · 答错 ${historyWrongQuestionIds.length}`
                : `已答 ${session.answeredCount}/${questions.length}`}
            </p>
          </div>
          <button
            type='button'
            onClick={() => session.setShowSheet(false)}
            className='inline-flex h-8 items-center rounded-md px-2 text-sm text-slate-500 hover:bg-slate-200 hover:text-slate-900'>
            关闭
          </button>
        </div>

        <div className='custom-scrollbar grid max-h-[calc(100vh-11.75rem)] gap-x-8 gap-y-5 overflow-y-auto p-4 md:max-h-[calc(100vh-9.5rem)] md:grid-cols-2 md:p-5'>
          {answerCardSections.map((section, sectionIndex) => (
            <React.Fragment key={section.key}>
              {(sectionIndex === 0 ||
                answerCardSections[sectionIndex - 1].materialKey !==
                  section.materialKey) && (
                <h5 className='border-b border-slate-300 pb-2 text-xs font-bold tracking-[0.16em] text-slate-500 md:col-span-2'>
                  {section.materialTitle}
                </h5>
              )}
              <section className='grid grid-cols-[minmax(7.5rem,auto)_1fr] items-start gap-3'>
                <div className='pt-1'>
                  <p className='text-sm font-bold text-slate-800'>
                    {isJapanesePaper
                      ? `問題${section.sectionNumber}`
                      : section.sectionTitle}
                  </p>
                  {isJapanesePaper ? (
                    <p className='mt-0.5 text-xs text-slate-500'>
                      {section.sectionTitle}
                    </p>
                  ) : null}
                </div>
                <div className='grid grid-cols-6 gap-1.5 sm:grid-cols-8'>
                  {section.items.map(item => {
                    const question = questions[item.questionIndex]
                    const isCurrent =
                      session.currentIndex === item.questionIndex
                    const isAnswered =
                      question.questionType === 'SORTING'
                        ? (session.sortingDrafts[question.id] || []).every(Boolean) &&
                          (session.sortingDrafts[question.id] || []).length ===
                            (question.options || []).length
                        : !!session.answers[question.id]
                    const isHistoryCorrect =
                      mode === 'history' &&
                      historyCorrectQuestionIdSet.has(question.id)
                    const isWrong =
                      mode === 'history'
                        ? historyWrongQuestionIdSet.has(question.id)
                        : session.isQuestionSubmitted(question.id) &&
                          session.wrongIndexes.includes(item.questionIndex)

                    return (
                      <button
                        key={question.id}
                        type='button'
                        aria-label={
                          isJapanesePaper
                            ? `問題${section.sectionNumber} ${section.sectionTitle} 第${item.localNumber}题`
                            : `${section.sectionTitle} 第${item.localNumber}题`
                        }
                        onClick={() => {
                          session.setCurrentIndex(item.questionIndex)
                          session.setShowSheet(false)
                        }}
                        className={`h-8 rounded-md border text-xs font-semibold transition-colors md:h-9 ${
                          isCurrent
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : isWrong
                              ? 'border-rose-300 bg-rose-50 text-rose-700'
                              : isHistoryCorrect
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                              : isAnswered
                                ? 'border-slate-400 bg-slate-200/70 text-slate-900'
                                : 'border-slate-300 bg-white text-slate-600 hover:border-slate-600 hover:text-slate-900'
                        }`}>
                        {item.localNumber}
                      </button>
                    )
                  })}
                </div>
              </section>
            </React.Fragment>
          ))}
        </div>
      </section>
    </>
  )
}
