import { notFound } from 'next/navigation'

import EditArticleUI from '@/features/content/ui/EditArticleUI'
import { getReadingEditData } from '@/lib/repositories/collection/manage'

export default async function ManageReadingEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const article = await getReadingEditData(id)
  if (!article) return notFound()
  return <EditArticleUI article={article} />
}
