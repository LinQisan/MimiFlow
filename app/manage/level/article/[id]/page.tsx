// app/admin/level/article/[id]/page.tsx
import prisma from '@/lib/prisma'
import { notFound } from 'next/navigation'
import EditArticleUI from './EditArticleUI'

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string }
}) {
  const resolvedParams = await params
  const { id } = resolvedParams

  const article = await prisma.passage.findUnique({
    where: { id },
    // 🌟 核心升级：查出文章的同时，把属于它的题目和选项全部捞出来！
    include: {
      paper: { select: { levelId: true } },
      questions: {
        orderBy: { order: 'asc' },
        include: { options: true },
      },
    },
  })

  if (!article) return notFound()

  return <EditArticleUI article={article} />
}
