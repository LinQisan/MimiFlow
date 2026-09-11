// Custom practice builder.
import {
  genericRandomPracticeGroups,
  getRandomPracticeFilterOptions,
  japaneseRandomPracticeGroups,
} from '@/lib/repositories/exam'
import CustomPaperBuilderClient from '@/modules/practice/components/CustomPaperBuilderClient'
import { getLatestActiveCustomPracticeSession } from '@/modules/practice/server/custom-session-service'

export default async function CustomPaperBuilderPage() {
  const [filterOptions, activeSession] = await Promise.all([
    getRandomPracticeFilterOptions(),
    getLatestActiveCustomPracticeSession(),
  ])
  return (
    <CustomPaperBuilderClient
      activeSession={
        activeSession
          ? { id: activeSession.id, title: activeSession.title }
          : null
      }
      japaneseGroups={japaneseRandomPracticeGroups}
      genericGroups={genericRandomPracticeGroups}
      languageOptions={filterOptions.languages}
      levelOptions={filterOptions.levels}
      levelOptionsByLanguage={filterOptions.levelsByLanguage}
    />
  )
}
