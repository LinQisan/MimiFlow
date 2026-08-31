import { notFound } from 'next/navigation'

import EditArticleUI from '@/features/content/ui/EditArticleUI'
import { getReadingEditData } from '@/lib/repositories/collection/manage'
import { getManagePaperMoveTargets } from '@/lib/repositories/exam'

export default async function ManageReadingEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ returnTo?: string | string[] }>
}) {
  const [{ id }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ])
  const rawReturnTo = Array.isArray(resolvedSearchParams.returnTo)
    ? resolvedSearchParams.returnTo[0]
    : resolvedSearchParams.returnTo
  const returnHref =
    rawReturnTo?.startsWith('/manage/reading') ||
    rawReturnTo?.startsWith('/manage/practice/')
      ? rawReturnTo
      : undefined
  const article = await getReadingEditData(id)
  if (!article) return notFound()
  const moveTargets =
    article.category.collectionType === 'PAPER' && article.category.levelId
      ? await getManagePaperMoveTargets(article.category.levelId)
      : []
  return (
    <EditArticleUI
      article={article}
      returnHref={returnHref}
      moveTargets={moveTargets}
    />
  )
}
