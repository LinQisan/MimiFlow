import '@/app/globals.css'

import { I18nProvider } from '@/context/I18nContext'
import { DialogProvider } from '@/context/DialogContext'
import { UserProvider } from '@/context/UserContext'
import StudyNavigation from '@/components/layout/StudyNavigation'
import { getOptionalCurrentUser } from '@/modules/users/server/current-user'

export const metadata = {
  title: 'MimiFlow',
  description: '日语听力、阅读、词汇与复习工作台',
  icons: [{ rel: 'icon', url: '/icon.svg', type: 'image/svg+xml' }],
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const currentUser = await getOptionalCurrentUser()

  return (
    <html lang='zh' data-lang='zh'>
      <body className='editorial-ui'>
        {currentUser ? (
          <UserProvider user={currentUser}>
            <I18nProvider>
              <DialogProvider>
                <StudyNavigation currentUser={currentUser} />
                {children}
              </DialogProvider>
            </I18nProvider>
          </UserProvider>
        ) : children}
      </body>
    </html>
  )
}
