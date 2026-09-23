import ManageShell from '@/modules/manage/ManageShell'
import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/modules/users/server/current-user'

export default async function ManageLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!(await getCurrentUser()).isAdmin) notFound()
  return <ManageShell>{children}</ManageShell>
}
