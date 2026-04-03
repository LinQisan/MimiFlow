import { notFound } from 'next/navigation'
import QuizEngineUI from '../QuizEngineUI'
import prisma from '@/lib/prisma'

export default async function QuizAllPage() {
  const quizzes = await prisma.quiz.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      paper: { select: { name: true, level: { select: { title: true } } } },
      questions: {
        include: {
          options: true,
          attempts: { select: { isCorrect: true } },
        },
      },
    },
  })

  if (!quizzes || quizzes.length === 0) return notFound()

  const allQuestions = quizzes.flatMap(quiz =>
    quiz.questions.map(question => ({
      ...question,
      sourcePaper: quiz.paper ? `${quiz.paper.name}` : '',
    })),
  )

  const quizData = {
    questions: allQuestions,
  }

  return (
    <div className='min-h-screen bg-gray-50 px-4 pb-20 pt-4 md:px-8 md:pt-8'>
      <QuizEngineUI quiz={quizData} backUrl='/quizzes' isAllMode={true} />
    </div>
  )
}
