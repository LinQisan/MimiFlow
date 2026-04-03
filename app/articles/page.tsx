import Link from 'next/link'
import prisma from '@/lib/prisma'

const FILTER_TYPES = [
  { value: 'all', label: '全部' },
  { value: '纯阅读', label: '纯阅读' },
  { value: '阅读理解', label: '阅读理解' },
  { value: '完形填空', label: '完形填空' },
  { value: '综合训练', label: '综合训练' },
] as const

const detectArticleType = (
  questions: { questionType: string }[] | undefined,
) => {
  if (!questions || questions.length === 0) {
    return {
      label: '纯阅读',
      style:
        'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300',
    }
  }

  const hasFillBlank = questions.some(q => q.questionType === 'FILL_BLANK')
  const hasReading = questions.some(
    q => q.questionType === 'READING_COMPREHENSION',
  )

  if (hasFillBlank && hasReading) {
    return {
      label: '综合训练',
      style:
        'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-300',
    }
  }

  if (hasFillBlank) {
    return {
      label: '完形填空',
      style:
        'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300',
    }
  }

  return {
    label: '阅读理解',
    style:
      'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300',
  }
}

const summarizePaperType = (questions: { questionType: string }[]) => {
  if (!questions.length) {
    return {
      label: '纯阅读',
      style:
        'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300',
    }
  }

  const hasFillBlank = questions.some(q => q.questionType === 'FILL_BLANK')
  const hasReading = questions.some(
    q => q.questionType === 'READING_COMPREHENSION',
  )

  if (hasFillBlank && hasReading) {
    return {
      label: '综合训练',
      style:
        'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-300',
    }
  }

  if (hasFillBlank) {
    return {
      label: '完形填空',
      style:
        'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300',
    }
  }

  if (hasReading) {
    return {
      label: '阅读理解',
      style:
        'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300',
    }
  }

  return {
    label: '专项训练',
    style:
      'border-gray-200 bg-gray-50 text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
  }
}

const getArticleLabel = (title: string, index: number) => {
  const trimmed = (title || '').trim()
  if (trimmed) return trimmed
  return `第 ${index + 1} 篇`
}

const matchesType = (
  questions: { questionType: string }[],
  selectedType: string,
) => {
  if (selectedType === 'all') return true

  const hasFillBlank = questions.some(q => q.questionType === 'FILL_BLANK')
  const hasReading = questions.some(
    q => q.questionType === 'READING_COMPREHENSION',
  )

  switch (selectedType) {
    case '纯阅读':
      return questions.length === 0
    case '阅读理解':
      return hasReading && !hasFillBlank
    case '完形填空':
      return hasFillBlank && !hasReading
    case '综合训练':
      return hasFillBlank && hasReading
    default:
      return true
  }
}

const getSingleParam = (
  value: string | string[] | undefined,
  fallback = '',
): string => {
  if (Array.isArray(value)) return value[0] || fallback
  return value || fallback
}

const buildArticlesHref = ({
  page,
  level,
  type,
}: {
  page?: number
  level?: string
  type?: string
}) => {
  const params = new URLSearchParams()

  if (page && page > 1) params.set('page', String(page))
  if (level && level !== 'all') params.set('level', level)
  if (type && type !== 'all') params.set('type', type)

  const query = params.toString()
  return query ? `/articles?${query}` : '/articles'
}

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams?:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>
}) {
  const PAGE_SIZE = 18
  const resolvedSearchParams = await Promise.resolve(searchParams || {})

  const rawPage = Number(getSingleParam(resolvedSearchParams.page, '1'))
  const currentPage = Number.isFinite(rawPage)
    ? Math.max(1, Math.floor(rawPage))
    : 1

  const rawSelectedLevel = getSingleParam(resolvedSearchParams.level, 'all')
  const rawSelectedType = getSingleParam(resolvedSearchParams.type, 'all')

  const allArticles = await prisma.passage.findMany({
    orderBy: [{ paper: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    include: {
      paper: {
        include: {
          level: {
            select: { title: true },
          },
        },
      },
      questions: {
        select: { questionType: true },
      },
    },
  })

  const availableLevels = Array.from(
    new Set(
      allArticles
        .map(article => article.paper?.level?.title || '')
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b))

  const selectedLevel = availableLevels.includes(rawSelectedLevel)
    ? rawSelectedLevel
    : 'all'

  const selectedType = FILTER_TYPES.some(item => item.value === rawSelectedType)
    ? rawSelectedType
    : 'all'

  const filteredArticles = allArticles.filter(article => {
    const matchesLevel =
      selectedLevel === 'all'
        ? true
        : (article.paper?.level?.title || '') === selectedLevel

    const matchesPracticeType = matchesType(article.questions, selectedType)

    return matchesLevel && matchesPracticeType
  })

  const filteredCount = filteredArticles.length
  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE))
  const normalizedPage = Math.min(currentPage, totalPages)
  const skip = (normalizedPage - 1) * PAGE_SIZE
  const pageArticles = filteredArticles.slice(skip, skip + PAGE_SIZE)

  const groupedArticles = pageArticles.reduce<
    {
      paperId: string
      categoryName: string
      levelTitle: string
      items: typeof pageArticles
    }[]
  >((acc, passage) => {
    const paperId = passage.paper?.id || '__uncategorized__'
    const categoryName = passage.paper?.name || '未分类'
    const levelTitle = passage.paper?.level?.title || ''
    const existing = acc.find(group => group.paperId === paperId)

    if (existing) {
      existing.items.push(passage)
      return acc
    }

    acc.push({
      paperId,
      categoryName,
      levelTitle,
      items: [passage],
    })

    return acc
  }, [])

  const paperSections = groupedArticles.map(group => {
    const allQuestions = group.items.flatMap(item => item.questions)
    return {
      ...group,
      practiceType: summarizePaperType(allQuestions),
    }
  })

  const hasActiveFilters = selectedLevel !== 'all' || selectedType !== 'all'

  return (
    <main className='min-h-screen bg-gray-50 px-4 pb-12 pt-4 dark:bg-slate-950 md:px-8 md:pt-6'>
      <div className='mx-auto w-full max-w-6xl'>
        <section className='mb-5 rounded-2xl border border-gray-200/80 bg-white/90 px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/88 md:px-6 md:py-5'>
          <div className='flex flex-col gap-2 md:flex-row md:items-end md:justify-between'>
            <div>
              <h1 className='text-2xl font-black tracking-tight text-gray-900 dark:text-slate-100 md:text-3xl'>
                阅读
              </h1>
              <p className='mt-1 text-xs text-gray-500 dark:text-slate-400 md:text-sm'>
                按试卷分组展示，试卷内横向排布文章。
              </p>
            </div>

            <div className='text-sm font-medium text-gray-500 dark:text-slate-400'>
              {filteredCount} 篇结果
            </div>
          </div>
        </section>

        <section className='mb-6 rounded-2xl border border-gray-200/80 bg-white/90 px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/88 md:px-5'>
          <form
            method='get'
            action='/articles'
            className='grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-end'>
            <div className='grid gap-3 sm:grid-cols-2'>
              <label className='block'>
                <span className='text-xs font-semibold text-gray-500 dark:text-slate-400'>
                  级别
                </span>
                <select
                  name='level'
                  defaultValue={selectedLevel}
                  className='mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'>
                  <option value='all'>全部</option>
                  {availableLevels.map(level => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </label>

              <label className='block'>
                <span className='text-xs font-semibold text-gray-500 dark:text-slate-400'>
                  类型
                </span>
                <select
                  name='type'
                  defaultValue={selectedType}
                  className='mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'>
                  <optgroup label='题型选项'>
                    {FILTER_TYPES.map(item => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>
            </div>

            <div className='flex flex-wrap items-center gap-2'>
              <button
                type='submit'
                className='ui-btn ui-btn-sm ui-btn-primary w-full sm:w-auto'>
                应用筛选
              </button>
              {hasActiveFilters && (
                <Link
                  href='/articles'
                  className='ui-btn ui-btn-sm w-full sm:w-auto'>
                  清除筛选
                </Link>
              )}
            </div>
          </form>
        </section>

        <div className='min-h-[62vh]'>
          {paperSections.length === 0 ? (
            <div className='rounded-3xl border border-dashed border-gray-300 bg-white/85 px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900/75'>
              <div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-indigo-500 dark:bg-indigo-900/50 dark:text-indigo-300 animate-pulse'>
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='currentColor'
                  className='h-7 w-7'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth='2'
                    d='M9 12l2 2 4-4m1 6a9 9 0 11-18 0 9 9 0 0118 0z'
                  />
                </svg>
              </div>
              <h3 className='mb-2 text-xl font-bold text-gray-700 dark:text-slate-200'>
                没有匹配结果
              </h3>
              <p className='text-sm text-gray-500 dark:text-slate-400'>
                试试更改级别或类型筛选，或清除筛选后查看全部。
              </p>
            </div>
          ) : (
            <div className='space-y-4'>
              {paperSections.map(group => (
                <details
                  key={group.paperId}
                  open
                  className='rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900/80'>
                  <summary className='flex cursor-pointer items-center justify-between gap-3 text-left'>
                    <div>
                      <div className='flex items-center gap-2'>
                        <h2 className='text-lg font-bold text-gray-900 dark:text-slate-100 md:text-xl'>
                          {group.categoryName}
                        </h2>
                        <span className='rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300'>
                          {group.items.length} 篇
                        </span>
                        {group.levelTitle && (
                          <span className='rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-300'>
                            {group.levelTitle}
                          </span>
                        )}
                      </div>
                      <p className='mt-2 text-xs text-gray-500 dark:text-slate-400'>
                        {group.practiceType.label}
                      </p>
                    </div>
                    <span className='text-xl text-gray-400 transition group-open:rotate-180 dark:text-slate-500'>
                      ⌄
                    </span>
                  </summary>

                  <div className='mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3'>
                    {group.items.map((passage, index) => (
                      <Link
                        href={`/articles/${passage.id}`}
                        key={passage.id}
                        className='group flex items-center justify-between rounded-lg border border-gray-200 p-3 transition-colors hover:border-indigo-300 hover:bg-indigo-50 dark:border-slate-800 dark:hover:border-indigo-700 dark:hover:bg-slate-800'>
                        <div className='min-w-0'>
                          <p className='mb-1 text-sm font-semibold text-indigo-500'>
                            第 {index + 1} 课
                          </p>
                          <h3 className='truncate text-base font-bold text-gray-900 transition group-hover:text-indigo-700 dark:text-slate-100'>
                            {getArticleLabel(passage.title, index)}
                          </h3>
                        </div>
                        <span className='shrink-0 text-2xl text-gray-300 transition-all group-hover:translate-x-1 group-hover:text-indigo-500 dark:text-slate-600 dark:group-hover:text-indigo-400'>
                          →
                        </span>
                      </Link>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <section className='mt-8 flex flex-col items-center justify-between gap-3 rounded-2xl border border-gray-200/80 bg-white/90 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/88 md:flex-row'>
            <div className='text-sm text-gray-500 dark:text-slate-400'>
              第 {normalizedPage} / {totalPages} 页
            </div>

            <div className='flex items-center gap-2'>
              <Link
                href={buildArticlesHref({
                  page: Math.max(1, normalizedPage - 1),
                  level: selectedLevel,
                  type: selectedType,
                })}
                className={`ui-btn ui-btn-sm ${
                  normalizedPage <= 1 ? 'pointer-events-none opacity-50' : ''
                }`}>
                上一页
              </Link>

              <Link
                href={buildArticlesHref({
                  page: Math.min(totalPages, normalizedPage + 1),
                  level: selectedLevel,
                  type: selectedType,
                })}
                className={`ui-btn ui-btn-sm ui-btn-primary ${
                  normalizedPage >= totalPages
                    ? 'pointer-events-none opacity-50'
                    : ''
                }`}>
                下一页
              </Link>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
