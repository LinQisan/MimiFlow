import { redirect } from 'next/navigation'

export default async function LegacyListeningEditorPage({
  params,
}: {
  params: Promise<{ lessonId: string }>
}) {
  const { lessonId } = await params
  redirect(`/manage/listening/${lessonId}#questions`)
}
