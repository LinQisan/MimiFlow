import ManageShell from '@/components/layout/ManageShell'
import { notFound } from 'next/navigation'

export default function ManageLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (process.env.NODE_ENV === 'production') notFound()
  return <ManageShell>{children}</ManageShell>
}
