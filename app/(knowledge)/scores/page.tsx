import ExamScoreManager from '@/modules/progress/exam-scores/components/ExamScoreManager'
import { listExamScores } from '@/modules/progress/exam-scores/server/repository'

export const revalidate = 0

export default async function ScoresPage() {
  const records = await listExamScores()

  return (
    <main className='min-h-screen bg-[#f6f5f1] px-4 py-6 md:px-8 md:py-8'>
      <div className='mx-auto max-w-6xl space-y-7'>
        <p className='ui-meta'>当前用户 · {records.length} 条记录</p>
        <ExamScoreManager initialRecords={records} />
      </div>
    </main>
  )
}
