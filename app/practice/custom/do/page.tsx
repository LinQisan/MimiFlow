// Custom focused practice session.
import Link from 'next/link'
import { readJsonRecord } from '@/lib/validation/schema'
import { redirect } from 'next/navigation'

import { PracticePlayer } from '@/modules/practice/components/PracticePlayer'
import type { RandomPracticeScope } from '@/lib/repositories/exam'
import {
  createCustomPracticeSession,
  getCustomPracticeSession,
  getLatestActiveCustomPracticeSession,
  restartCustomPracticeSession,
} from '@/modules/practice/server/custom-session-service'

export const dynamic = 'force-dynamic'

function toFirstValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export default async function CustomPaperDoingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const resolved = await searchParams

  const sessionId = toFirstValue(resolved.session)?.trim()
  if (sessionId) {
    const data = await getCustomPracticeSession(sessionId)
    if (!data) {
      redirect('/practice/custom')
    }

    const { session, examData } = data
    const normalizedLanguage = (session.language || '').trim().toLowerCase()
    const isJapanesePaper =
      normalizedLanguage === 'ja' ||
      normalizedLanguage.startsWith('ja-') ||
      /日语|日文|日本語/.test(session.language || '')

    return (
      <PracticePlayer
        key={session.id}
        questions={examData.questions}
        customSessionId={session.id}
        initialSubmitted={Boolean(session.completedAt)}
        initialAnswers={Object.fromEntries(
          Object.entries(readJsonRecord(session.answers)).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )}
        initialSortingOrders={Object.fromEntries(
          Object.entries(readJsonRecord(session.sortingOrders)).filter(
            (entry): entry is [string, string[]] =>
              Array.isArray(entry[1]) &&
              entry[1].every(value => typeof value === 'string'),
          ),
        )}
        paperTitle={session.title}
        sourceTitles={examData.sourceCollections}
        paperLanguage={session.language}
        mode='random'
        exitHref='/practice/custom'
        exitLabel='返回自定义设置'
        restartHref={`/practice/custom/do?restart=${encodeURIComponent(session.id)}`}
        draftKey={`practice:draft:custom:${session.id}`}
        pronunciationMap={examData.pronunciationMap}
        loadSudachiInBackground={isJapanesePaper}
        vocabularyMetaMap={examData.vocabularyMetaMap}
      />
    )
  }

  const restartId = toFirstValue(resolved.restart)?.trim()
  if (restartId) {
    const newSession = await restartCustomPracticeSession(restartId)
    if (newSession) {
      redirect(`/practice/custom/do?session=${encodeURIComponent(newSession.id)}`)
    }
    redirect('/practice/custom')
  }

  const selectionKeys = (toFirstValue(resolved.sections) || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  const totalRequested = Math.max(
    0,
    Math.min(100, Math.floor(Number(toFirstValue(resolved.count) || 0))),
  )

  if (totalRequested <= 0 || selectionKeys.length === 0) {
    const active = await getLatestActiveCustomPracticeSession()
    if (active) {
      redirect(`/practice/custom/do?session=${encodeURIComponent(active.id)}`)
    }
    redirect('/practice/custom')
  }

  const language = toFirstValue(resolved.language)?.trim() || ''
  const level = toFirstValue(resolved.level)?.trim() || ''
  const rawScope = toFirstValue(resolved.scope)?.trim()
  const scope: RandomPracticeScope =
    rawScope === 'attempted' || rawScope === 'all'
      ? rawScope
      : 'unattempted'

  const created = await createCustomPracticeSession({
    selectionKeys,
    count: totalRequested,
    language,
    level,
    scope,
  })

  if (!created || created.session.questionIds.length === 0) {
    return (
      <div className='flex min-h-screen flex-col items-center justify-center bg-[#f6f5f1] p-6 text-center'>
        <div className='ui-empty max-w-md'>
          <p className='text-base font-bold text-slate-900'>
            未找到可用题目
          </p>
          <p className='mt-1'>当前筛选条件下暂无题目，请调整题型或数量后再试。</p>
          <Link
            href='/practice/custom'
            className='ui-btn ui-btn-primary mt-5'>
            返回自定义设置
          </Link>
        </div>
      </div>
    )
  }

  redirect(`/practice/custom/do?session=${encodeURIComponent(created.session.id)}`)
}
