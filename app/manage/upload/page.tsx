// app/admin/upload/page.tsx
import UploadCenterUI from './UploadCenterUI'
import prisma from '@/lib/prisma'

export default async function UnifiedUploadPage() {
  // 1. 查出大模块 (用于听力/字幕上传)
  const dbLevels = await prisma.level.findMany({
    select: { id: true, title: true },
  })

  // 2. 查出所有已有的试卷组 (用于听力/字幕上传)
  const dbCategories = await prisma.paper.findMany({
    select: {
      id: true,
      name: true,
      level: { select: { title: true } },
      lessons: {
        select: { title: true, audioFile: true },
        orderBy: { sortOrder: 'desc' },
        take: 1,
      },
    },
    orderBy: { id: 'desc' },
  })

  return (
    // 将数据喂给客户端 UI 组件
    <UploadCenterUI dbLevels={dbLevels} dbCategories={dbCategories} />
  )
}
