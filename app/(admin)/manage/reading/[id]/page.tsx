import { notFound } from 'next/navigation'

import EditArticleUI from '@/features/content/ui/EditArticleUI'
import { getReadingEditData } from '@/lib/repositories/collection/manage'

export default async function ManageReadingEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ returnTo?: string | string[] }>
}) {
  const { id } = await params
  const resolvedSearchParams = await searchParams
  const rawReturnTo = Array.isArray(resolvedSearchParams.returnTo)
    ? resolvedSearchParams.returnTo[0]
    : resolvedSearchParams.returnTo
  const returnHref = rawReturnTo?.startsWith('/manage/reading')
    ? rawReturnTo
    : undefined
  const article = await getReadingEditData(id)
  if (!article) return notFound()
  return <EditArticleUI article={article} returnHref={returnHref} />
}
