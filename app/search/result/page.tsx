import Link from 'next/link'
import {
  getGlobalSearchResultDetail,
  type GlobalSearchType,
} from '@/app/actions/globalSearch'

const TYPE_LABEL: Record<GlobalSearchType, string> = {
  vocabulary: '单词',
  sentence: '句子',
  passage: '阅读',
  quiz: '题库',
  question: '题目',
  dialogue: '听力',
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const formatPrimitive = (value: unknown) => {
  if (typeof value === 'string') return `"${value}"`
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  return String(value)
}

function JsonTreeNode({
  name,
  value,
  depth = 0,
}: {
  name?: string
  value: unknown
  depth?: number
}) {
  const nameNode = name ? (
    <span className='font-semibold text-slate-600 dark:text-slate-300'>{name}</span>
  ) : null

  if (Array.isArray(value)) {
    return (
      <details open={depth < 1} className='group rounded-lg border border-slate-200/80 bg-white/80'>
        <summary className='cursor-pointer select-none px-3 py-2 text-sm text-slate-700 hover:bg-slate-50'>
          {nameNode}
          {name ? <span className='mx-1 text-slate-400'>:</span> : null}
          <span className='text-cyan-700'>Array</span>
          <span className='ml-1 text-xs text-slate-400'>[{value.length}]</span>
        </summary>
        <div className='space-y-1 border-t border-slate-100 p-2'>
          {value.length === 0 ? (
            <div className='px-2 py-1 text-xs text-slate-400'>空数组</div>
          ) : (
            value.map((item, index) => (
              <JsonTreeNode
                key={`json-array-${depth}-${index}`}
                name={`${index}`}
                value={item}
                depth={depth + 1}
              />
            ))
          )}
        </div>
      </details>
    )
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value)
    return (
      <details open={depth < 1} className='group rounded-lg border border-slate-200/80 bg-white/80'>
        <summary className='cursor-pointer select-none px-3 py-2 text-sm text-slate-700 hover:bg-slate-50'>
          {nameNode}
          {name ? <span className='mx-1 text-slate-400'>:</span> : null}
          <span className='text-indigo-700'>Object</span>
          <span className='ml-1 text-xs text-slate-400'>{`{${entries.length}}`}</span>
        </summary>
        <div className='space-y-1 border-t border-slate-100 p-2'>
          {entries.length === 0 ? (
            <div className='px-2 py-1 text-xs text-slate-400'>空对象</div>
          ) : (
            entries.map(([key, item]) => (
              <JsonTreeNode
                key={`json-object-${depth}-${key}`}
                name={key}
                value={item}
                depth={depth + 1}
              />
            ))
          )}
        </div>
      </details>
    )
  }

  const primitive = formatPrimitive(value)
  const valueClass =
    typeof value === 'string'
      ? 'text-emerald-700'
      : typeof value === 'number'
        ? 'text-blue-700'
        : typeof value === 'boolean'
          ? 'text-fuchsia-700'
          : value === null
            ? 'text-slate-500'
            : 'text-slate-700'

  return (
    <div className='rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-sm'>
      {nameNode}
      {name ? <span className='mx-1 text-slate-400'>:</span> : null}
      <span className={`font-mono ${valueClass}`}>{primitive}</span>
    </div>
  )
}

export default async function SearchResultDetailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const resolved = await searchParams
  const ridRaw = resolved.rid
  const typeRaw = resolved.type

  const rid = Array.isArray(ridRaw) ? ridRaw[0] : ridRaw || ''
  const type = (Array.isArray(typeRaw) ? typeRaw[0] : typeRaw || '') as GlobalSearchType

  const isValidType = (
    ['vocabulary', 'sentence', 'passage', 'quiz', 'question', 'dialogue'] as const
  ).includes(type)

  if (!rid || !isValidType) {
    return (
      <main className='min-h-screen bg-slate-50 px-4 py-8 md:px-6'>
        <div className='mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm'>
          <h1 className='text-xl font-bold text-slate-900'>搜索结果不存在</h1>
          <p className='mt-2 text-sm text-slate-500'>参数缺失或无效。</p>
          <Link
            href='/search'
            className='mt-4 inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50'>
            返回搜索
          </Link>
        </div>
      </main>
    )
  }

  const detail = await getGlobalSearchResultDetail(rid, type)
  if (!detail) {
    return (
      <main className='min-h-screen bg-slate-50 px-4 py-8 md:px-6'>
        <div className='mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm'>
          <h1 className='text-xl font-bold text-slate-900'>未找到结果详情</h1>
          <p className='mt-2 text-sm text-slate-500'>结果可能已删除或不再可用。</p>
          <Link
            href='/search'
            className='mt-4 inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50'>
            返回搜索
          </Link>
        </div>
      </main>
    )
  }

  const rawJson = JSON.stringify(detail.raw, null, 2)
  const byteSize = Buffer.byteLength(rawJson, 'utf8')
  const topLevelCount =
    Array.isArray(detail.raw)
      ? detail.raw.length
      : isPlainObject(detail.raw)
        ? Object.keys(detail.raw).length
        : 1

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 md:px-6 md:py-8'>
      <div className='mx-auto max-w-5xl space-y-4'>
        <header className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700'>
              {TYPE_LABEL[type]}
            </span>
            <h1 className='text-xl font-bold text-slate-900 md:text-2xl'>
              {detail.title}
            </h1>
          </div>
          <div className='mt-4 flex flex-wrap gap-2'>
            <Link
              href='/search'
              className='rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50'>
              返回搜索
            </Link>
            {detail.targetHref ? (
              <Link
                href={detail.targetHref}
                className='rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700'>
                前往目标页面
              </Link>
            ) : null}
          </div>
        </header>

        <section className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div>
              <h2 className='text-base font-bold text-slate-900'>结构化数据视图</h2>
              <p className='mt-1 text-xs text-slate-500'>
                已按层级展示，可逐层展开查看细节。
              </p>
            </div>
            <div className='flex flex-wrap gap-1.5'>
              <span className='rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600'>
                顶层节点 {topLevelCount}
              </span>
              <span className='rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600'>
                大小 {byteSize} B
              </span>
            </div>
          </div>

          <div className='mt-3 rounded-xl border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-2.5 md:p-3'>
            <JsonTreeNode value={detail.raw} />
          </div>

          <details className='mt-3 rounded-xl border border-slate-200 bg-slate-50'>
            <summary className='cursor-pointer select-none px-3 py-2 text-xs font-semibold text-slate-600'>
              查看原始 JSON 文本
            </summary>
            <pre className='overflow-x-auto border-t border-slate-200 px-3 py-3 text-xs leading-relaxed text-slate-700'>
              {rawJson}
            </pre>
          </details>
        </section>
      </div>
    </main>
  )
}
