'use client'

import { createContext, useContext } from 'react'

import type { UserSummary } from '@/modules/users/server/current-user'

const UserContext = createContext<UserSummary | null>(null)

export function UserProvider({
  user,
  children,
}: {
  user: UserSummary
  children: React.ReactNode
}) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>
}

export function useCurrentUser() {
  const user = useContext(UserContext)
  if (!user) throw new Error('useCurrentUser 必须在 UserProvider 中使用')
  return user
}

export const userStorageKey = (userId: string, key: string) =>
  `mimiflow:${userId}:${key}`

export const readUserStorageValue = (userId: string, key: string) => {
  if (typeof window === 'undefined') return null
  const scopedKey = userStorageKey(userId, key)
  const scopedValue = window.localStorage.getItem(scopedKey)
  if (scopedValue !== null || userId !== 'default') return scopedValue

  const legacyValue = window.localStorage.getItem(key)
  if (legacyValue !== null) {
    window.localStorage.setItem(scopedKey, legacyValue)
  }
  return legacyValue
}
