import {
  getRandomPracticeFilterOptions,
  randomPracticeTypeOptions,
} from '@/lib/repositories/exam.repo'
import CustomPaperBuilderClient from './CustomPaperBuilderClient'

export default async function CustomPaperBuilderPage() {
  const filterOptions = await getRandomPracticeFilterOptions()
  return (
    <CustomPaperBuilderClient
      options={randomPracticeTypeOptions}
      languageOptions={filterOptions.languages}
      levelOptions={filterOptions.levels}
    />
  )
}
