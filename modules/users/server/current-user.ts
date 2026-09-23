import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getSessionUser } from './auth'

export type UserSummary = {
  id: string
  name: string
  isAdmin: boolean
}

export const getOptionalCurrentUser = cache(async (): Promise<UserSummary | null> =>
  getSessionUser(),
)

export async function getCurrentUser(): Promise<UserSummary> {
  const user = await getOptionalCurrentUser()
  if (!user) redirect('/login')
  return user
}

export async function getCurrentUserId() {
  return (await getCurrentUser()).id
}

export async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user.isAdmin) throw new Error('没有管理权限。')
  return user
}
