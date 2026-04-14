import '@/app/globals.css'

import { I18nProvider } from '@/context/I18nContext'
import { DialogProvider } from '@/context/DialogContext'

export const metadata = {
  title: 'MimiFlow',
  description: '日语听力跟读系统',
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
          <DialogProvider>{children}</DialogProvider>
        </I18nProvider>
      </body>
    </html>
  )
}
