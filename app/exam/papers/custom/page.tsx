import { randomPracticeTypeOptions } from '@/lib/repositories/exam.repo'
import CustomPaperBuilderClient from './CustomPaperBuilderClient'

export default function CustomPaperBuilderPage() {
  return <CustomPaperBuilderClient options={randomPracticeTypeOptions} />
}
