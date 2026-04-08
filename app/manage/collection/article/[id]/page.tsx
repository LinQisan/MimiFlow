import { notFound } from 'next/navigation'

import EditArticleUI from './EditArticleUI'
import { getReadingEditData } from '@/lib/repositories/collection-manage.repo'

export default async function ManageCollectionArticleEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const article = await getReadingEditData(id)
  if (!article) return notFound()
  return <EditArticleUI article={article} />
}

