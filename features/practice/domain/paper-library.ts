import type {
  ExamHubLevelSummary,
  ExamHubPaperSummary,
} from '@/lib/repositories/exam'

export type PaperLibraryFilters = {
  query: string
  language: string
  level: string
  sort: PaperLibrarySort
}

export type PaperLibrarySort = 'newest' | 'oldest' | 'name'

const paperLanguageLabel = (value: string | null) => {
  const label = (value || '').trim()
  const normalized = label.toLowerCase()
  if (
    normalized === 'ja' ||
    normalized.startsWith('ja-') ||
    normalized === 'japanese'
  ) return '日语'
  if (
    normalized === 'en' ||
    normalized.startsWith('en-') ||
    normalized === 'english'
  ) return '英语'
  if (normalized === 'zh' || normalized.startsWith('zh-')) return '中文'
  return label || '未设置'
}

const paperLevelLabel = (value: string | null) =>
  (value || '未设置').trim()

export const paperLanguageUsesLevels = (value: string | null) => {
  const language = paperLanguageLabel(value)
  return language !== '英语'
}

export function filterPaperLevels(
  levels: ExamHubLevelSummary[],
  filters: PaperLibraryFilters,
) {
  const keyword = filters.query.trim().toLowerCase()
  return levels
    .map(group => ({
      ...group,
      papers: group.papers
        .filter(paper => {
          if (
            filters.language !== 'all' &&
            paperLanguageLabel(paper.language) !== filters.language
          ) return false
          if (
            filters.level !== 'all' &&
            (!paperLanguageUsesLevels(paper.language) ||
              paperLevelLabel(paper.level) !== filters.level)
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
        })
        .sort((left, right) => comparePapers(left, right, filters.sort)),
    }))
    .filter(group => group.papers.length > 0)
}

function resolvePaperTime(paper: ExamHubPaperSummary) {
  const namedDate = paper.name.match(
    /((?:19|20)\d{2})\s*年\s*(1[0-2]|0?[1-9])\s*月/,
  )
  if (namedDate) {
    return Date.UTC(Number(namedDate[1]), Number(namedDate[2]) - 1, 1)
  }

  const separatedDate = paper.name.match(
    /((?:19|20)\d{2})\s*[-_.]\s*(1[0-2]|0?[1-9])(?:\D|$)/,
  )
  if (separatedDate) {
    return Date.UTC(Number(separatedDate[1]), Number(separatedDate[2]) - 1, 1)
  }

  return new Date(paper.updatedAt).getTime()
}

function comparePapers(
  left: ExamHubPaperSummary,
  right: ExamHubPaperSummary,
  sort: PaperLibrarySort,
) {
  if (sort === 'name') {
    return left.name.localeCompare(right.name, 'zh-CN', { numeric: true })
  }
  const difference = resolvePaperTime(right) - resolvePaperTime(left)
  if (difference !== 0) return sort === 'oldest' ? -difference : difference
  return right.name.localeCompare(left.name, 'zh-CN', { numeric: true })
}

export function getPaperLibraryStats(papers: ExamHubPaperSummary[]) {
  const attempts = papers.reduce((sum, paper) => sum + paper.attemptCount, 0)
  const correctAttempts = papers.reduce(
    (sum, paper) => sum + paper.attemptCorrectCount,
    0,
  )
  return {
    questions: papers.reduce((sum, paper) => sum + paper.questionCount, 0),
    completedPractices: papers.reduce(
      (sum, paper) => sum + paper.completedPracticeCount,
      0,
    ),
    averageAccuracy:
      attempts > 0 ? Math.round((correctAttempts / attempts) * 100) : null,
  }
}

export function getPaperFilterOptions(papers: ExamHubPaperSummary[]) {
  return {
    languages: uniqueSorted(papers.map(paper => paperLanguageLabel(paper.language))),
    levels: uniqueSorted(
      papers
        .filter(paper => paperLanguageUsesLevels(paper.language))
        .map(paper => paperLevelLabel(paper.level)),
    ),
  }
}

export function getPaperQuestionBreakdown(paper: ExamHubPaperSummary) {
  return [
    { label: '文字・語彙', value: paper.textVocabularyQuestionCount },
    { label: '文法', value: paper.grammarQuestionCount },
    { label: '読解', value: paper.readingQuestionCount },
    { label: '聴解', value: paper.lessonQuestionCount },
  ]
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, 'zh-CN'))
}
