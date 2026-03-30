// 文件路径：app/layout.tsx
import './globals.css'
import { Noto_Sans_JP } from 'next/font/google'

// 引入思源黑体日语版
const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
})

export const metadata = {
  title: 'MimiFlow',
  description: '日语听力跟读系统',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang='ja' suppressHydrationWarning>
      {/* 全局应用该日语字体 */}
      <body className={notoSansJP.className} suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
