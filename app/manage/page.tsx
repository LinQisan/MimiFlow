import Link from 'next/link'

import {
  listListeningLessonsForShadowing,
  listListeningMaterialsForShadowing,
  listReadingMaterials,
} from '@/lib/repositories/materials'
import { isEbookSourceKind } from '@/lib/ebooks/source-kind'

export default async function ManageHomePage() {
  const [listening, shadowing, reading] = await Promise.all([
    listListeningLessonsForShadowing(),
    listListeningMaterialsForShadowing(),
    listReadingMaterials(),
  ])

  const missingQuestions = listening.filter((item) => item.needsQuestion).length
  const missingSection = listening.filter((item) => item.needsSection).length
  const unclassifiedShadowing = shadowing.filter(
    (item) => !item.isClassified,
  ).length
  const readingMissingQuestions = reading.filter(
    (item) =>
      !isEbookSourceKind(item.sourceKind) &&
      item.paper?.collectionType === 'PAPER' &&
      item.questionCount === 0,
  ).length
  const duplicateGroups = Object.values(
    listening.reduce<Record<string, number>>((groups, item) => {
      const key = (item.audioFile || item.title).trim().toLowerCase()
      if (key) groups[key] = (groups[key] || 0) + 1
      return groups
    }, {}),
  ).filter((count) => count > 1).length

  const todos = [
    {
      label: '听力缺少题目',
      count: missingQuestions,
      href: '/manage/listening',
      tone: 'rose',
    },
    {
      label: '听力未设置所属問題',
      count: missingSection,
      href: '/manage/listening',
      tone: 'amber',
    },
    {
      label: '疑似重复听力',
      count: duplicateGroups,
      href: '/manage/listening',
      tone: 'amber',
    },
    {
      label: '跟读未归类',
      count: unclassifiedShadowing,
      href: '/manage/shadowing',
      tone: 'violet',
    },
    {
      label: '阅读文章缺少题目',
      count: readingMissingQuestions,
      href: '/manage/reading?status=missingQuestions',
      tone: 'rose',
    },
  ] as const
  const totalTodo = todos.reduce((sum, item) => sum + item.count, 0)

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="pb-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
                异常与待办
              </h1>
            </div>
            <div className="min-w-28 pl-5 text-right">
              <p className="font-sans text-4xl font-semibold text-slate-900">
                {totalTodo}
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                {totalTodo ? '项待处理' : '当前无异常'}
              </p>
            </div>
          </div>
        </header>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">优先处理</h2>
            <Link
              href="/manage/system"
              className="text-sm font-semibold text-slate-500 hover:text-slate-900"
            >
              系统检查 →
            </Link>
          </div>
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {todos.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="group px-2 py-6 transition hover:bg-slate-50 lg:px-6"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-700">
                      {item.label}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                      {item.count ? '点击进入处理' : '无需处理'}
                    </p>
                  </div>
                  <span
                    className={`text-3xl font-bold ${item.count ? 'text-rose-600' : 'text-slate-500'}`}
                  >
                    {item.count}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="grid md:grid-cols-3 gap-6">
          {[
            ['听力材料', listening.length, '/manage/listening'],
            ['跟读材料', shadowing.length, '/manage/shadowing'],
            ['阅读材料', reading.length, '/manage/reading'],
          ].map(([label, count, href]) => (
            <Link
              key={String(href)}
              href={String(href)}
              className="bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              <span>{label}</span>
              <span className="float-right text-slate-400">{count}</span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  )
}
