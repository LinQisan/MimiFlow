'use server'

import { cookies } from 'next/headers'
import { z } from 'zod'

import prisma from '@/lib/prisma'
import { CURRENT_USER_COOKIE } from '@/modules/users/server/current-user'

const userNameSchema = z.string().trim().min(1, '请输入用户名').max(24, '用户名最多 24 个字')
const userIdSchema = z.string().trim().min(1)

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
}

const selectUser = async (userId: string) => {
  const cookieStore = await cookies()
  cookieStore.set(CURRENT_USER_COOKIE, userId, cookieOptions)
}

export async function createUser(name: string) {
  const parsed = userNameSchema.safeParse(name)
  if (!parsed.success) {
    return { success: false as const, message: parsed.error.issues[0]?.message || '用户名不正确' }
  }

  try {
    const user = await prisma.user.create({
      data: { name: parsed.data },
      select: { id: true, name: true },
    })
    await selectUser(user.id)
    return { success: true as const, user }
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    ) {
      return { success: false as const, message: '这个用户名已经存在' }
    }
    console.error('创建用户失败:', error)
    return { success: false as const, message: '创建失败，请稍后再试' }
  }
}

export async function switchUser(userId: string) {
  const parsed = userIdSchema.safeParse(userId)
  if (!parsed.success) {
    return { success: false as const, message: '用户不存在' }
  }

  const user = await prisma.user.findUnique({
    where: { id: parsed.data },
    select: { id: true, name: true },
  })
  if (!user) return { success: false as const, message: '用户不存在' }

  await selectUser(user.id)
  return { success: true as const, user }
}
