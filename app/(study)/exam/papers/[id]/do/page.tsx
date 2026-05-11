// app/exam/papers/[id]/do/page.tsx
import { notFound } from 'next/navigation'
import { getExamQuestionsByPaperId } from '@/lib/repositories/exam'
import { PracticePlayer } from '@/components/exam/PracticePlayer'
// Next.js 页面接收路由参数
export default async function ExamDoingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ qid?: string }>
}) {
  const { id } = await params

  const { qid } = await searchParams
  // 1. 调用独立出来的 Repo 获取干净的数据
  const examData = await getExamQuestionsByPaperId(id)
  if (!examData || examData.questions.length === 0) {
    notFound() // 触发 Next.js 的 404 页面，或者你可以 return 一个自定义的错误提示
  }

  const questions = examData.questions
  let initialIndex = 0
  if (qid) {
    const foundIndex = questions.findIndex(q => q.id === qid)
    if (foundIndex !== -1) {
      initialIndex = foundIndex
    }
  }

  return (
    <div className='min-h-screen bg-slate-50'>
      {/* 这里将获取到的题目数据传给客户端组件。
        PracticePlayer 内部包含了 useState 和上一题/下一题的交互逻辑。
      */}
      <PracticePlayer
        questions={examData.questions}
        paperTitle={examData.paperTitle}
        paperLanguage={examData.paperLanguage}
        mode='exam'
        initialIndex={initialIndex}
        pronunciationMap={examData.pronunciationMap}
        vocabularyMetaMap={examData.vocabularyMetaMap}
      />
    </div>
  )
}
