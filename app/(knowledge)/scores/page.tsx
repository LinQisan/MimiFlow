import PageHeader from '@/components/layout/PageHeader'
import ExamScoreManager from '@/modules/progress/exam-scores/components/ExamScoreManager'
import { listExamScores } from '@/modules/progress/exam-scores/server/repository'

export const revalidate = 0

export default async function ScoresPage() {
  const records = await listExamScores()

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 md:px-8 md:py-8'>
      <div className='mx-auto max-w-6xl space-y-7'>
        <PageHeader
          showTitle
          title='考试成绩'
          description='补录以前参加的 JLPT 或 TOEIC 成绩，保留自己的考试轨迹。'
          meta={<span>当前用户 · {records.length} 条记录</span>}
        />
        <ExamScoreManager initialRecords={records} />
      </div>
    </main>
  )
}
