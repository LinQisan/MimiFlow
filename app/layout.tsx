import '@/app/globals.css'

import { I18nProvider } from '@/context/I18nContext'
import { DialogProvider } from '@/context/DialogContext'
import StudyNavigation from '@/components/layout/StudyNavigation'

export const metadata = {
  title: 'MimiFlow',
  description: '日语听力、阅读、词汇与复习工作台',
  icons: [{ rel: 'icon', url: '/icon.svg', type: 'image/svg+xml' }],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang='zh' data-lang='zh' suppressHydrationWarning>
      <body suppressHydrationWarning>
        <I18nProvider>
          <DialogProvider>
            <StudyNavigation />
            {children}
          </DialogProvider>
        </I18nProvider>
      </body>
    </html>
  )
}
