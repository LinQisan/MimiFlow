'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/context/I18nContext'

type BreadcrumbsProps = {
  levels?: { id: string; title: string }[]
  articleTitle?: string
}

type Crumb = {
  href: string
  label: string
  clickable?: boolean
  isTitle?: boolean
}

const looksLikeId = (segment: string) => {
  if (!segment) return false
  if (/^[0-9]+$/.test(segment)) return true
  if (/^[a-z0-9]{16,}$/i.test(segment)) return true
  if (/^[a-f0-9-]{24,}$/i.test(segment)) return true
  return false
}

export default function Breadcrumbs({
  levels = [],
  articleTitle,
}: BreadcrumbsProps) {
  const pathname = usePathname()
  const { t } = useI18n()

  const getText = (key: string, fallback: string) => {
    const value = t(key)
    return value === key ? fallback : value
  }

  const levelTitleMap = useMemo(
    () =>
      levels.reduce(
        (acc, level) => {
          acc[level.id] = level.title
          return acc
        },
        {} as Record<string, string>,
      ),
    [levels],
  )

  const segmentLabelMap = useMemo<Record<string, string>>(
    () => ({
      manage: getText('nav.sectionManage', '管理'),
      level: getText('nav.sectionCorpus', '语料'),
      lessons: '听力',
      lesson: '听力',
      articles: getText('nav.articles', '阅读'),
      article: getText('nav.articles', '阅读'),
      quizzes: getText('nav.quizzes', '刷题'),
      quiz: getText('nav.quizzes', '刷题'),
      vocabulary: getText('nav.vocabulary', '生词'),
      review: getText('nav.review', '复习'),
      retry: getText('nav.retry', '错题'),
      search: getText('nav.search', '搜索'),
      game: getText('nav.game', '游戏'),
      diaries: getText('nav.diaries', '日记'),
      today: getText('nav.today', '今日任务'),
      upload: getText('nav.manageUpload', '语料录入'),
      audio: getText('nav.manageAudio', '录音管理'),
      fsrs: getText('nav.manageFsrs', 'FSRS面板'),
      import: getText('nav.manageAnki', '导入'),
      anki: 'Anki',
      sentences: getText('nav.sentences', '句库'),
      settings: getText('nav.settings', '设置'),
    }),
    [getText],
  )

  const crumbs = useMemo<Crumb[]>(() => {
    const normalizedPath = pathname.split('?')[0].split('#')[0]
    const segments = normalizedPath.split('/').filter(Boolean)

    const list: Crumb[] = [
      {
        href: '/',
        label: getText('nav.home', '主页'),
        clickable: true,
      },
    ]

    // 专门处理文章详情页：/articles/[id]
    if (
      segments.length >= 2 &&
      segments[0] === 'articles' &&
      looksLikeId(segments[1])
    ) {
      list.push({
        href: '/articles',
        label: segmentLabelMap.articles,
        clickable: true,
      })

      const title = articleTitle?.trim()
      if (title) {
        list.push({
          href: normalizedPath,
          label: title,
          clickable: false,
          isTitle: true,
        })
      }

      return list
    }

    let href = ''

    segments.forEach((segment, index) => {
      href += `/${segment}`
      const prev = segments[index - 1] || ''

      let label = segmentLabelMap[segment]

      if (!label && prev === 'level' && levelTitleMap[segment]) {
        label = levelTitleMap[segment]
      }

      if (!label && looksLikeId(segment)) {
        label = getText('nav.detail', '详情')
      }

      if (!label) {
        label = decodeURIComponent(segment)
      }

      if (!label.trim()) return

      list.push({
        href,
        label,
        clickable: true,
      })
    })

    return list
  }, [articleTitle, getText, levelTitleMap, pathname, segmentLabelMap])

  if (crumbs.length <= 1) return null

  return (
    <nav aria-label='Breadcrumb' className='px-4 py-2 md:px-6'>
      <ol className='flex flex-wrap items-center gap-1 text-xs text-gray-500 dark:text-slate-400'>
        {crumbs.map((crumb, index) => {
          const shouldRenderAsText = crumb.clickable === false

          const baseClass = crumb.isTitle
            ? 'truncate max-w-[120px] md:max-w-[320px] lg:max-w-[420px]'
            : 'truncate max-w-[120px] md:max-w-[180px] lg:max-w-[220px]'

          return (
            <li
              key={`${crumb.href}-${index}`}
              className='flex min-w-0 items-center gap-1'>
              {index > 0 && (
                <span className='text-gray-300 dark:text-slate-600'>/</span>
              )}

              {shouldRenderAsText ? (
                <span
                  className={`${baseClass} font-semibold text-gray-700 dark:text-slate-200`}
                  title={crumb.label}>
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className={`${baseClass} transition-colors hover:text-gray-700 dark:hover:text-slate-200`}
                  title={crumb.label}>
                  {crumb.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
