import 'server-only'

import { cache } from 'react'
import { cookies } from 'next/headers'

import prisma from '@/lib/prisma'

export const CURRENT_USER_COOKIE = 'mimiflow_user_id'

export type UserSummary = {
  id: string
  name: string
}

export const getCurrentUser = cache(async (): Promise<UserSummary> => {
  const cookieStore = await cookies()
  const selectedId = cookieStore.get(CURRENT_USER_COOKIE)?.value?.trim()

  if (selectedId) {
    const selected = await prisma.user.findUnique({
      where: { id: selectedId },
      select: { id: true, name: true },
    })
    if (selected) return selected
  }

  const fallback = await prisma.user.findFirst({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true },
  })

  if (!fallback) {
    throw new Error('暂无可用用户，请先执行数据库迁移。')
  }

  return fallback
})

export async function getCurrentUserId() {
  return (await getCurrentUser()).id
}

export async function listUsers(): Promise<UserSummary[]> {
  return prisma.user.findMany({
    orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true },
  })
}
