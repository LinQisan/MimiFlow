// Custom practice builder.
import {
  genericRandomPracticeGroups,
  getRandomPracticeFilterOptions,
  japaneseRandomPracticeGroups,
} from '@/lib/repositories/exam'
import CustomPaperBuilderClient from './CustomPaperBuilderClient'

export default async function CustomPaperBuilderPage() {
  const filterOptions = await getRandomPracticeFilterOptions()
  return (
    <CustomPaperBuilderClient
      japaneseGroups={japaneseRandomPracticeGroups}
      genericGroups={genericRandomPracticeGroups}
      languageOptions={filterOptions.languages}
      levelOptions={filterOptions.levels}
    />
  )
}
