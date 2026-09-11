import ManageShell from '@/modules/manage/ManageShell'

export default function ManageLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <ManageShell>{children}</ManageShell>
}
