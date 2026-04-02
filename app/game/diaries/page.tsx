import Link from 'next/link'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

type Entry = {
  dateKey: string
  diaryContent: string
  diaryWordCount: number
  recallContent: string
  recallWordCount: number
  outputScore: number
  outputSummary: string
  outputActions: string[]
  updatedAt: Date
}

const toPreview = (value: string, max = 220) => {
  const normalized = (value || '').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max)}...`
}

export default async function GameDiariesPage() {
  const [diaries, recalls, outputs] = await Promise.all([
    prisma.learningDiary.findMany({
      orderBy: { dateKey: 'desc' },
      take: 120,
      select: {
        dateKey: true,
        content: true,
        wordCount: true,
        updatedAt: true,
      },
    }),
    prisma.morningRecall.findMany({
      orderBy: { dateKey: 'desc' },
      take: 120,
      select: {
        dateKey: true,
        content: true,
        wordCount: true,
        updatedAt: true,
      },
    }),
    prisma.outputPractice.findMany({
      where: { practiceType: 'WRITING' },
      orderBy: { dateKey: 'desc' },
      take: 120,
      select: {
        dateKey: true,
        totalScore: true,
        feedbackSummary: true,
        actionItems: true,
        updatedAt: true,
      },
    }),
  ])

  const map = new Map<string, Entry>()

  diaries.forEach(item => {
    map.set(item.dateKey, {
      dateKey: item.dateKey,
      diaryContent: item.content,
      diaryWordCount: item.wordCount,
      recallContent: '',
      recallWordCount: 0,
      outputScore: 0,
      outputSummary: '',
      outputActions: [],
      updatedAt: item.updatedAt,
    })
  })

  recalls.forEach(item => {
    const existed = map.get(item.dateKey)
    if (!existed) {
      map.set(item.dateKey, {
        dateKey: item.dateKey,
        diaryContent: '',
        diaryWordCount: 0,
        recallContent: item.content,
        recallWordCount: item.wordCount,
        outputScore: 0,
        outputSummary: '',
        outputActions: [],
        updatedAt: item.updatedAt,
      })
      return
    }
    existed.recallContent = item.content
    existed.recallWordCount = item.wordCount
    if (item.updatedAt > existed.updatedAt) {
      existed.updatedAt = item.updatedAt
    }
  })

  outputs.forEach(item => {
    const parsedActions = item.actionItems
      ? (() => {
          try {
            const parsed = JSON.parse(item.actionItems)
            return Array.isArray(parsed)
              ? parsed.map(action => String(action || '').trim()).filter(Boolean)
              : []
          } catch {
            return []
          }
        })()
      : []
    const existed = map.get(item.dateKey)
    if (!existed) {
      map.set(item.dateKey, {
        dateKey: item.dateKey,
        diaryContent: '',
        diaryWordCount: 0,
        recallContent: '',
        recallWordCount: 0,
        outputScore: item.totalScore,
        outputSummary: item.feedbackSummary || '',
        outputActions: parsedActions,
        updatedAt: item.updatedAt,
      })
      return
    }
    existed.outputScore = item.totalScore
    existed.outputSummary = item.feedbackSummary || ''
    existed.outputActions = parsedActions
    if (item.updatedAt > existed.updatedAt) existed.updatedAt = item.updatedAt
  })

  const entries = Array.from(map.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey))

  return (
    <main className='min-h-screen bg-gray-50 px-4 py-6 md:px-6 md:py-8'>
      <div className='mx-auto max-w-5xl'>
        <section className='border-b border-gray-200 pb-5'>
          <div className='flex flex-wrap items-end justify-between gap-3'>
            <div>
              <h1 className='text-3xl font-black text-gray-900'>每日日记</h1>
              <p className='mt-2 text-sm text-gray-500'>查看费曼复述与次日晨默写，追踪表达连续性。</p>
            </div>
            <Link href='/game' className='ui-btn ui-btn-sm'>
              返回游戏页
            </Link>
          </div>
        </section>

        <section className='mt-4 space-y-3'>
          {entries.length === 0 && (
            <div className='border border-gray-200 bg-white px-4 py-5 text-sm text-gray-500'>
              还没有日记记录。
            </div>
          )}

          {entries.map(entry => (
            <article key={entry.dateKey} className='border border-gray-200 bg-white px-4 py-4'>
              <div className='flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3'>
                <h2 className='text-base font-bold text-gray-900'>{entry.dateKey}</h2>
                <span className='text-xs text-gray-500'>
                  更新于 {entry.updatedAt.toLocaleString('ja-JP', { hour12: false })}
                </span>
              </div>

              <div className='mt-3 grid grid-cols-1 gap-3 md:grid-cols-3'>
                <section className='border border-gray-100 bg-gray-50 px-3 py-3'>
                  <div className='flex items-center justify-between'>
                    <h3 className='text-sm font-bold text-gray-800'>费曼复述</h3>
                    <span className='text-xs text-gray-500'>{entry.diaryWordCount} 字</span>
                  </div>
                  <p className='mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-700'>
                    {entry.diaryContent ? toPreview(entry.diaryContent) : '未填写'}
                  </p>
                </section>

                <section className='border border-gray-100 bg-gray-50 px-3 py-3'>
                  <div className='flex items-center justify-between'>
                    <h3 className='text-sm font-bold text-gray-800'>次日晨默写</h3>
                    <span className='text-xs text-gray-500'>{entry.recallWordCount} 字</span>
                  </div>
                  <p className='mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-700'>
                    {entry.recallContent ? toPreview(entry.recallContent) : '未填写'}
                  </p>
                </section>

                <section className='border border-gray-100 bg-gray-50 px-3 py-3'>
                  <div className='flex items-center justify-between'>
                    <h3 className='text-sm font-bold text-gray-800'>输出评估</h3>
                    <span className='text-xs text-gray-500'>综合分 {entry.outputScore}</span>
                  </div>
                  <p className='mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-700'>
                    {entry.outputSummary || '未提交 AI 评估'}
                  </p>
                  {entry.outputActions.length > 0 && (
                    <ul className='mt-2 space-y-1 text-xs text-gray-600'>
                      {entry.outputActions.slice(0, 3).map((action, actionIndex) => (
                        <li key={`${entry.dateKey}-action-${actionIndex}`}>- {action}</li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  )
}
