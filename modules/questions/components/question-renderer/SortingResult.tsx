import { buildCompletedSortingText, parseSortingPrompt } from '@/modules/practice/domain/question-text'
import { isCompleteOptionIdOrder } from '@/modules/questions/domain/sorting'
import { annotateExamText } from './annotate'
import type { ExamAnnotationSettings, ExamQuestion, ExamQuestionOption } from './types'
import styles from './SortingResult.module.css'

type Props = {
  question: ExamQuestion
  selectedSlots: Array<ExamQuestionOption | null>
  annotation: ExamAnnotationSettings
  isJapanesePaper: boolean
}

export function SortingResult({ question, selectedSlots, annotation, isJapanesePaper }: Props) {
  const options = question.options || []
  const correctOrder = question.correctOrder || []
  const hasCorrectOrder = options.length > 0 && isCompleteOptionIdOrder(correctOrder, options)
  const correctSlots = hasCorrectOrder
    ? correctOrder.map(id => options.find(option => option.id === id)!)
    : []
  const hasCompleteSentence = hasCorrectOrder && parseSortingPrompt(question.prompt).slotCount === options.length
  const completedSentence = hasCompleteSentence
    ? buildCompletedSortingText(question.prompt, options, correctOrder.map(id => options.findIndex(option => option.id === id)))
    : ''
  const differs = correctSlots.map((option, index) => selectedSlots[index]?.id !== option.id)
  const hasDifference = differs.some(Boolean)
  const textClass = isJapanesePaper ? 'exam-japanese-text' : ''

  return (
    <section className={styles.result} aria-label='排序题结果'>
      {completedSentence ? (
        <>
          <div className={styles.heading}>正确句子<span>可划词学习</span></div>
          <p
            data-source-type='QUIZ_QUESTION'
            data-source-id={question.id}
            data-context-block='true'
            data-context-sentence='true'
            data-context-role='sorting-correct-answer'
            className={`${styles.sentence} ${textClass}`}
            dangerouslySetInnerHTML={{ __html: annotateExamText({ text: completedSentence, settings: annotation }) }}
          />
        </>
      ) : (
        <p className={styles.unavailable}>完整正确句子暂未配置。</p>
      )}
      {hasCorrectOrder && hasDifference ? (
        <div className={styles.comparison}>
          <table className={styles.table}>
            <caption className={styles.caption}>排列对比 · 下划线标出错位词块</caption>
            <tbody>
              {[
                { label: '你的排列', values: selectedSlots, yours: true },
                { label: '正确排列', values: correctSlots, yours: false },
              ].map(row => (
                <tr key={row.label}>
                  <th scope='row'>{row.label}</th>
                  {correctSlots.map((_, index) => {
                    const option = row.values[index]
                    return (
                      <td key={index}>
                        <span
                          data-source-type='QUIZ_QUESTION'
                          data-source-id={question.id}
                          data-context-block='true'
                          className={`${styles.word} ${textClass} ${differs[index] ? row.yours ? styles.misplaced : styles.corrected : styles.unchanged}`}>
                          {differs[index] && <span className='sr-only' data-context-ignore='true'>{row.yours ? '错位：' : '应为：'}</span>}
                          <span dangerouslySetInnerHTML={{ __html: annotateExamText({ text: option?.text || '未作答', settings: annotation }) }} />
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : hasCorrectOrder ? <p className={styles.unavailable}>你的排列与正确顺序一致。</p> : null}
    </section>
  )
}
