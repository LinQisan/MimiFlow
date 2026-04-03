export const metadata = {
  title: 'MimiFlow-Manage',
}

export default function ManageLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className='theme-page-manage min-h-full'>{children}</div>
}
