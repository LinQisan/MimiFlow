import ManageShell from '@/components/layout/ManageShell'

export default function ManageLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <ManageShell>{children}</ManageShell>
}
