// 文件路径：app/layout.tsx
import './globals.css'
import { I18nProvider } from '@/context/I18nContext'
import { DialogProvider } from '@/context/DialogContext'
import AppShell from '@/components/AppShell'
import prisma from '@/lib/prisma'

export const metadata = {
  title: 'MimiFlow',
  description: '日语听力跟读系统',
  icons: [{ rel: 'icon', url: '/icon.svg', type: 'image/svg+xml' }],
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const levels = await prisma.level.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, title: true },
  })

  return (
    <html lang='zh' suppressHydrationWarning>
      <body suppressHydrationWarning>
        <I18nProvider>
          <DialogProvider>
            <AppShell levels={levels}>{children}</AppShell>
          </DialogProvider>
        </I18nProvider>
      </body>
    </html>
  )
}
