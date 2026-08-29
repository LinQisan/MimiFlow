type JlptScoreSection = 'LANGUAGE' | 'READING' | 'LISTENING'

export type JlptScoredAnswer = {
  section: JlptScoreSection
  problemNumber: number
  isCorrect: boolean
}

type JlptSectionScore = {
  rawScore: number
  rawMax: number
  score: number
  maxScore: 60
  passed: boolean
}

export type JlptScoreSummary = {
  language: JlptSectionScore
  reading: JlptSectionScore
  listening: JlptSectionScore
  totalScore: number
  maxScore: 180
  passLine: number | null
  passed: boolean | null
}

const RAW_MAX: Record<JlptScoreSection, number> = {
  LANGUAGE: 54,
  READING: 50,
  LISTENING: 52,
}

const QUESTION_WEIGHTS: Record<JlptScoreSection, Record<number, number>> = {
  LANGUAGE: { 1: 1, 2: 1, 3: 1, 4: 2, 5: 1, 6: 1, 7: 2 },
  READING: { 8: 2, 9: 2, 10: 3, 11: 2, 12: 3, 13: 2 },
  LISTENING: { 1: 2, 2: 2, 3: 2, 4: 1, 5: 3 },
}

const getQuestionWeight = (
  section: JlptScoreSection,
  problemNumber: number,
) => QUESTION_WEIGHTS[section][problemNumber] || 0

const buildSectionScore = (
  section: JlptScoreSection,
  answers: JlptScoredAnswer[],
): JlptSectionScore => {
  const rawScore = answers.reduce(
    (total, answer) =>
      total +
      (answer.section === section && answer.isCorrect
        ? getQuestionWeight(section, answer.problemNumber)
        : 0),
    0,
  )
  const rawMax = RAW_MAX[section]
  const score = Math.min(60, Math.max(0, Math.round((rawScore / rawMax) * 60)))
  return {
    rawScore,
    rawMax,
    score,
    maxScore: 60,
    passed: score >= 19,
  }
}

export function calculateJlptScore(
  answers: JlptScoredAnswer[],
  level?: string | null,
): JlptScoreSummary {
  const language = buildSectionScore('LANGUAGE', answers)
  const reading = buildSectionScore('READING', answers)
  const listening = buildSectionScore('LISTENING', answers)
  const totalScore = language.score + reading.score + listening.score
  const normalizedLevel = (level || '').trim().toUpperCase()
  const passLine = normalizedLevel === 'N1' ? 100 : null
  const passed =
    passLine === null
      ? null
      : language.passed &&
        reading.passed &&
        listening.passed &&
        totalScore >= passLine

  return {
    language,
    reading,
    listening,
    totalScore,
    maxScore: 180,
    passLine,
    passed,
  }
}
