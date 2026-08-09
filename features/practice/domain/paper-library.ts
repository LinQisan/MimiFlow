import type {
  ExamHubLevelSummary,
  ExamHubPaperSummary,
} from '@/lib/repositories/exam'

export type PaperLibraryFilters = {
  query: string
  language: string
  level: string
}

export const paperLanguageLabel = (value: string | null) =>
  (value || '未设置').trim()

export const paperLevelLabel = (value: string | null) =>
  (value || '未设置').trim()

export function filterPaperLevels(
  levels: ExamHubLevelSummary[],
  filters: PaperLibraryFilters,
) {
  const keyword = filters.query.trim().toLowerCase()
  return levels
    .map(group => ({
      ...group,
      papers: group.papers.filter(paper => {
        if (
          filters.language !== 'all' &&
          paperLanguageLabel(paper.language) !== filters.language
        ) return false
        if (
          filters.level !== 'all' &&
          paperLevelLabel(paper.level) !== filters.level
        ) return false
        if (!keyword) return true
        return [
          paper.name,
          paper.description || '',
          paper.language || '',
          paper.level || '',
          group.title,
        ]
          .join(' ')
          .toLowerCase()
          .includes(keyword)
      }),
    }))
    .filter(group => group.papers.length > 0)
}

export function getPaperLibraryStats(papers: ExamHubPaperSummary[]) {
  const papersWithAccuracy = papers.filter(
    paper => paper.attemptAccuracyPct !== null,
  )
  return {
    questions: papers.reduce((sum, paper) => sum + paper.questionCount, 0),
    attempts: papers.reduce((sum, paper) => sum + paper.attemptCount, 0),
    averageAccuracy:
      papersWithAccuracy.length === 0
        ? null
        : Math.round(
            papersWithAccuracy.reduce(
              (sum, paper) => sum + (paper.attemptAccuracyPct || 0),
              0,
            ) / papersWithAccuracy.length,
          ),
  }
}

export function getPaperFilterOptions(papers: ExamHubPaperSummary[]) {
  return {
    languages: uniqueSorted(papers.map(paper => paperLanguageLabel(paper.language))),
    levels: uniqueSorted(papers.map(paper => paperLevelLabel(paper.level))),
  }
}

export function groupPapersByLanguageAndLevel(papers: ExamHubPaperSummary[]) {
  const groups = new Map<
    string,
    { language: string; level: string; papers: ExamHubPaperSummary[] }
  >()
  for (const paper of papers) {
    const language = paperLanguageLabel(paper.language)
    const level = paperLevelLabel(paper.level)
    const key = `${language}\u0000${level}`
    const group = groups.get(key) || { language, level, papers: [] }
    group.papers.push(paper)
    groups.set(key, group)
  }
  return Array.from(groups.values()).sort(
    (left, right) =>
      left.language.localeCompare(right.language, 'zh-CN') ||
      left.level.localeCompare(right.level, 'zh-CN'),
  )
}

export function getPaperQuestionBreakdown(paper: ExamHubPaperSummary) {
  const reading = Math.max(
    0,
    paper.questionCount - paper.lessonQuestionCount - paper.quizQuestionCount,
  )
  return [
    { label: '文字词汇・语法', value: paper.quizQuestionCount },
    { label: '阅读', value: reading },
    { label: '听力', value: paper.lessonQuestionCount },
  ]
}

export function formatPaperDate(value: string | Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, 'zh-CN'))
}
