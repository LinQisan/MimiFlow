// app/admin/manage/quiz/[id]/page.tsx
import { notFound } from 'next/navigation'
import EditQuizUI from './EditQuizUI'
import prisma from '@/lib/prisma'

export default async function EditQuizPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const resolvedParams = await params

  // 🌟 核心：不仅查出 quiz，还要顺藤摸瓜把 questions 和 options 查出来
  const quiz = await prisma.quiz.findUnique({
    where: { id: resolvedParams.id },
    include: {
      category: { select: { levelId: true } },
      questions: {
        orderBy: { order: 'asc' },
        include: {
          options: true, // 把四个选项也带上
        },
      },
    },
  })

  if (!quiz) return notFound()

  return <EditQuizUI quiz={quiz} />
}
