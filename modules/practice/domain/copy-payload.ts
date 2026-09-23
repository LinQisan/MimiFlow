import type { ExamQuestion } from '../../questions/components/question-renderer/types.ts'
import { formatOptionLabel, normalizeOptionLabelFormat } from '../../../utils/questions/optionLabels.ts'

export function buildPracticeCopyPayload(
  copyQuestions: ExamQuestion[],
  formatCopyText: (value: string) => string,
) {
  const buildCopyPayload = (question: ExamQuestion) => {
    const sections: string[] = []
    if (question.lesson?.sectionTitle) {
      sections.push(`听力部分：${formatCopyText(question.lesson.sectionTitle)}`)
    }
    if (question.lesson?.audioFile) {
      sections.push(`音频：${question.lesson.audioFile}`)
    }

    if (question.passageId) {
      const passage = (question.passage?.content || '').trim()
      if (passage) sections.push(`阅读正文：\n${formatCopyText(passage)}`)
    }

    const context = (question.contextSentence || '').trim()
    const prompt = (question.prompt || '').trim()
    if (prompt) sections.push(`题目：${formatCopyText(prompt)}`)
    else if (context) sections.push(`题目：${formatCopyText(context)}`)

    const optionLabelFormat = normalizeOptionLabelFormat(
      question.optionLabelFormat,
      'numeric',
    )
    const optionLines = (question.options || [])
      .map((option, index) => {
        const marker = formatOptionLabel(
          index,
          optionLabelFormat,
          question.customOptionLabels,
        )
        const text = (option.text || '').trim()
        return text ? `${marker}. ${formatCopyText(text)}` : ''
      })
      .filter(Boolean)
    if (optionLines.length > 0) {
      sections.push(`选项：\n${optionLines.join('\n')}`)
    }

    return sections.join('\n\n').trim()
  }

  const buildListeningTranscriptCopyPayload = (copyQuestions: ExamQuestion[]) => {
    const lessonQuestion = copyQuestions.find(
      question => (question.lesson?.dialogues || []).length > 0,
    )
    if (!lessonQuestion?.lesson) return ''

    const lessonId = lessonQuestion.lessonId || lessonQuestion.lesson.id
    const lessonQuestions = copyQuestions.filter(
      question => (question.lessonId || question.lesson?.id) === lessonId,
    )
    const transcriptText = [...(lessonQuestion.lesson.dialogues || [])]
      .filter(line => (line.text || '').trim())
      .sort(
        (left, right) =>
          left.start - right.start ||
          (left.sequenceId || 0) - (right.sequenceId || 0),
      )
      .map(line => formatCopyText((line.text || '').trim()))
      .join('\n')
    const optionsText = lessonQuestions
      .flatMap(question => question.options || [])
      .map((option, index) => {
        const text = (option.text || '').trim()
        return text ? `${index + 1}. ${formatCopyText(text)}` : ''
      })
      .filter(Boolean)
      .join('\n')
    const sections = [
      transcriptText,
      optionsText ? `选项：\n${optionsText}` : '',
    ].filter(Boolean)
    return sections.join('\n\n').trim()
  }

  const listeningPayload = buildListeningTranscriptCopyPayload(copyQuestions)
  return listeningPayload || copyQuestions.map(buildCopyPayload).join('\n\n---\n\n')
}
