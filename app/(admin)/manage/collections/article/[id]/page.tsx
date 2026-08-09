import { redirect } from 'next/navigation'

export default async function ManageCollectionArticleEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/manage/reading/${id}`)
}
