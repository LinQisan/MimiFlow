import { getTopMaterialSnapshots } from '@/lib/repositories/materials'
import { getReviewOverview } from '@/modules/review/server/queries'

type TodayTaskItem = {
  id: 'memory' | 'listening' | 'reading' | 'retry'
  title: string
  targetCount: number
  unit: string
  description: string
  href: string
  disabled?: boolean
}

export type TodayStudyPlan = {
  dateKey: string
  tasks: TodayTaskItem[]
  startHref: string
}

const toDateKey = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)

const countParagraphs = (content: string) => {
  const lines = content
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
  if (lines.length > 0) return lines.length
  return content
    .split(/(?<=[。！？.!?])/)
    .map(item => item.trim())
    .filter(Boolean).length
}

export async function getTodayStudyPlan(): Promise<TodayStudyPlan> {
  const now = new Date()
  const [review, topMaterials] = await Promise.all([
    getReviewOverview(now),
    getTopMaterialSnapshots(),
  ])

  const topLesson = topMaterials.topLesson
  const topArticle = topMaterials.topArticle
  const listeningCount = topLesson
    ? Math.min(16, Math.min(12, Math.max(6, topLesson._count.dialogues)))
    : 0
  const readingParagraphCount = topArticle
    ? Math.min(12, Math.min(8, Math.max(3, countParagraphs(topArticle.content))))
    : 0

  const memoryTask: TodayTaskItem = {
    id: 'memory',
    title: '记忆复习',
    targetCount: Math.min(20, review.dueMemory),
    unit: '条',
    description: '复习到期的单词和句子，稳定记忆曲线。',
    href: '/review/memory',
    disabled: review.dueMemory === 0,
  }
  const listeningTask: TodayTaskItem = {
    id: 'listening',
    title: '听力',
    targetCount: listeningCount,
    unit: '句',
    description: topLesson
      ? `推荐从《${topLesson.title}》开始。`
      : '暂无听力语料，请先录入。',
    href: topLesson
      ? `/listening/${topLesson.id}`
      : '/manage/import?type=listening',
    disabled: !topLesson,
  }
  const readingTask: TodayTaskItem = {
    id: 'reading',
    title: '阅读',
    targetCount: readingParagraphCount,
    unit: '段',
    description: topArticle
      ? `推荐从《${topArticle.title || '阅读材料'}》开始。`
      : '暂无阅读材料，请先录入。',
    href: topArticle
      ? `/reading/articles/${topArticle.id}`
      : '/manage/import?type=reading',
    disabled: !topArticle,
  }
  const retryTask: TodayTaskItem = {
    id: 'retry',
    title: '错题巩固',
    targetCount: review.dueMistakes,
    unit: '题',
    description:
      review.dueMistakes > 0
        ? '按 24h/72h/7d 节奏巩固错题。'
        : '当前没有到期错题。',
    href: '/review/mistakes',
    disabled: review.dueMistakes === 0,
  }

  const tasks = [memoryTask, listeningTask, readingTask, retryTask]
  return {
    dateKey: toDateKey(now),
    tasks,
    startHref: tasks.find(task => !task.disabled)?.href || '/',
  }
}
