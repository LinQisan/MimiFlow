// 文件路径：app/layout.tsx
import './globals.css'
import { Noto_Sans_JP } from 'next/font/google'
import { I18nProvider } from '@/context/I18nContext'
import { DialogProvider } from '@/context/DialogContext'
import AppShell from '@/components/AppShell'
import prisma from '@/lib/prisma'
// 引入思源黑体日语版
const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
})

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
      {/* 全局应用该日语字体 */}
      <body className={notoSansJP.className} suppressHydrationWarning>
        <I18nProvider>
          <DialogProvider>
            <AppShell levels={levels}>{children}</AppShell>
          </DialogProvider>
        </I18nProvider>
      </body>
    </html>
  )
}
