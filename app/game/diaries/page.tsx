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
  outputModelEssay: string
  outputModelHighlights: string[]
  updatedAt: Date
}

const toPreview = (value: string, max = 220) => {
  const normalized = (value || '').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max)}...`
}

const formatDateTimeStable = (value: Date) =>
  new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(value)

const parseModelEssayFromRaw = (raw: string) => {
  const source = (raw || '').trim()
  if (!source) return { modelEssay: '', modelEssayHighlights: [] as string[] }
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const firstJson = fenced || source.match(/\{[\s\S]*\}/)?.[0] || ''
  if (!firstJson) return { modelEssay: '', modelEssayHighlights: [] as string[] }
  try {
    const parsed = JSON.parse(firstJson) as {
      modelEssay?: unknown
      modelEssayHighlights?: unknown
    }
    return {
      modelEssay: String(parsed.modelEssay || '').trim(),
      modelEssayHighlights: Array.isArray(parsed.modelEssayHighlights)
        ? parsed.modelEssayHighlights
            .map(item => String(item || '').trim())
            .filter(Boolean)
            .slice(0, 3)
        : [],
    }
  } catch {
    return { modelEssay: '', modelEssayHighlights: [] as string[] }
  }
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
        aiFeedbackRaw: true,
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
      outputModelEssay: '',
      outputModelHighlights: [],
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
        outputModelEssay: '',
        outputModelHighlights: [],
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
    const modelEssay = parseModelEssayFromRaw(item.aiFeedbackRaw || '')
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
        outputModelEssay: modelEssay.modelEssay,
        outputModelHighlights: modelEssay.modelEssayHighlights,
        updatedAt: item.updatedAt,
      })
      return
    }
    existed.outputScore = item.totalScore
    existed.outputSummary = item.feedbackSummary || ''
    existed.outputActions = parsedActions
    existed.outputModelEssay = modelEssay.modelEssay
    existed.outputModelHighlights = modelEssay.modelEssayHighlights
    if (item.updatedAt > existed.updatedAt) existed.updatedAt = item.updatedAt
  })

  const entries = Array.from(map.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey))

  return (
    <main className='bg-gray-50 px-4 py-5 md:px-6 md:py-6'>
      <div className='mx-auto max-w-6xl'>
        <section className='border-b border-gray-200 pb-5'>
          <div className='flex flex-wrap items-end justify-between gap-3'>
            <div>
              <h1 className='text-3xl font-black text-gray-900'>每日日记</h1>
              <p className='mt-2 text-sm text-gray-500'>
                复盘当天输出、次日默写与 AI 反馈，持续跟踪表达进步。
              </p>
            </div>
            <Link href='/game' className='ui-btn ui-btn-sm'>
              返回游戏页
            </Link>
          </div>
        </section>

        <section className='mt-4 space-y-3 pb-6'>
          {entries.length === 0 && (
            <div className='border border-gray-200 bg-white px-4 py-5 text-sm text-gray-500'>
              还没有日记记录。
            </div>
          )}

          {entries.map(entry => (
            <article
              key={entry.dateKey}
              className='rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm'>
              <div className='flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3'>
                <div className='flex flex-wrap items-center gap-2'>
                  <h2 className='text-base font-bold text-gray-900'>{entry.dateKey}</h2>
                  <span className='ui-tag ui-tag-muted'>
                    复述 {entry.diaryWordCount} 字
                  </span>
                  <span className='ui-tag ui-tag-muted'>
                    默写 {entry.recallWordCount} 字
                  </span>
                  <span className='ui-tag ui-tag-info'>评分 {entry.outputScore}</span>
                </div>
                <span className='text-xs text-gray-500 whitespace-nowrap'>
                  更新于 {formatDateTimeStable(entry.updatedAt)}
                </span>
              </div>

              <div className='mt-3 grid grid-cols-1 items-start gap-3 lg:grid-cols-12'>
                <section className='rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 lg:col-span-4'>
                  <div className='flex items-center justify-between gap-2'>
                    <h3 className='text-sm font-bold text-gray-800'>费曼复述</h3>
                  </div>
                  <p className='mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-700'>
                    {entry.diaryContent ? toPreview(entry.diaryContent) : '未填写'}
                  </p>
                  {entry.diaryContent && (
                    <details className='mt-2'>
                      <summary className='cursor-pointer text-xs font-semibold text-indigo-600'>
                        查看全文
                      </summary>
                      <p className='mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-700'>
                        {entry.diaryContent}
                      </p>
                    </details>
                  )}
                </section>

                <section className='rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 lg:col-span-4'>
                  <div className='flex items-center justify-between gap-2'>
                    <h3 className='text-sm font-bold text-gray-800'>次日晨默写</h3>
                  </div>
                  <p className='mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-700'>
                    {entry.recallContent ? toPreview(entry.recallContent) : '未填写'}
                  </p>
                  {entry.recallContent && (
                    <details className='mt-2'>
                      <summary className='cursor-pointer text-xs font-semibold text-indigo-600'>
                        查看全文
                      </summary>
                      <p className='mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-700'>
                        {entry.recallContent}
                      </p>
                    </details>
                  )}
                </section>

                <section className='rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 lg:col-span-4'>
                  <div className='flex items-center justify-between gap-2'>
                    <h3 className='text-sm font-bold text-gray-800'>输出评估</h3>
                  </div>
                  <p className='mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-700'>
                    {entry.outputSummary
                      ? toPreview(entry.outputSummary, 180)
                      : '未提交 AI 评估'}
                  </p>
                  <div className='mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-500'>
                    <span>建议 {entry.outputActions.length} 条</span>
                    {entry.outputModelEssay && <span>含 AI 范文</span>}
                  </div>

                  {(entry.outputSummary || entry.outputActions.length > 0 || entry.outputModelEssay) && (
                    <details className='mt-2'>
                      <summary className='cursor-pointer text-xs font-semibold text-indigo-600'>
                        查看完整评估
                      </summary>
                      <div className='mt-2 max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-white px-3 py-2'>
                        {entry.outputSummary && (
                          <p className='whitespace-pre-wrap text-sm leading-relaxed text-gray-700'>
                            {entry.outputSummary}
                          </p>
                        )}
                        {entry.outputActions.length > 0 && (
                          <ul className='mt-2 space-y-1 text-xs text-gray-600'>
                            {entry.outputActions.map((action, actionIndex) => (
                              <li key={`${entry.dateKey}-action-${actionIndex}`}>
                                {action}
                              </li>
                            ))}
                          </ul>
                        )}
                        {entry.outputModelEssay && (
                          <div className='mt-3 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2'>
                            <p className='text-xs font-bold text-indigo-700'>AI 范文（i+1）</p>
                            <p className='mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-700'>
                              {toPreview(entry.outputModelEssay, 320)}
                            </p>
                            {entry.outputModelHighlights.length > 0 && (
                              <ul className='mt-2 space-y-1 text-xs text-indigo-700/90'>
                                {entry.outputModelHighlights.map((item, idx) => (
                                  <li key={`${entry.dateKey}-model-highlight-${idx}`}>{item}</li>
                                ))}
                              </ul>
                            )}
                            <details className='mt-2'>
                              <summary className='cursor-pointer text-xs font-semibold text-indigo-700'>
                                展开完整范文
                              </summary>
                              <p className='mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-700'>
                                {entry.outputModelEssay}
                              </p>
                            </details>
                          </div>
                        )}
                      </div>
                    </details>
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
