// app/admin/page.tsx
import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'

export default async function AdminIndexPage() {
  // 1. 去数据库查一下，排在第一位的 Level 是什么
  const firstLevel = await prisma.level.findFirst({
    orderBy: { id: 'asc' }, // 或者按 sortOrder 排，取决于你的设计
  })

  // 2. 如果有 Level 数据，直接无缝跳转到该 Level 的管理专区
  if (firstLevel) {
    redirect(`/admin/level/${firstLevel.id}`)
  } else {
    // 3. 如果数据库是空的（刚部署），就跳转到录入中心
    redirect('/admin/upload')
  }
}
