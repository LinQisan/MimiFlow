import { redirect } from 'next/navigation'

export default async function ManageCollectionQuizEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/manage/questions/${id}`)
}
