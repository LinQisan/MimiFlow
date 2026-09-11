'use server'

import { revalidatePath } from 'next/cache'

import { executeAction } from '@/lib/actions/result'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import type { VocabularyInspectorEntryDraft } from './domain/inspector-entry'
import { invalidateVocabularyGroupsCache } from './server/repository'
import {
  findVocabularyInspectorData,
  updateFullVocabularyFromInspector as persistFullVocabularyFromInspector,
} from './server/inspector-entry-service'

export type VocabularyInspectorData = {
  id: string
  word: string
  wordAudio: string | null
  sentences: Array<{
    text: string
    translation: string | null
    audioFile: string | null
    audioData?: { audioFile: string; start: number; end: number } | null
    sourceUrl?: string
    source: string
    posTags: string[]
  }>
  memberships: Array<{ id: string; label: string }>
  availableWordbooks: Array<{ id: string; label: string }>
  entry: VocabularyInspectorEntryDraft
}

export async function getVocabularyInspectorData(
  word: string,
  wordbookId?: string,
) {
  const userId = await getCurrentUserId()
  const normalizedWord = word.normalize('NFKC').trim()
  if (!normalizedWord) {
    return { success: false as const, message: '单词为空' }
  }
  const data = await findVocabularyInspectorData(
    userId,
    normalizedWord,
    wordbookId,
  )
  if (!data) {
    return { success: false as const, message: '没有找到这个单词的收藏记录' }
  }
  return { success: true as const, data }
}

export async function updateFullVocabularyFromInspector(input: unknown) {
  return executeAction(
    async () => {
      const userId = await getCurrentUserId()
      const result = await persistFullVocabularyFromInspector(userId, input)
      revalidatePath('/vocabulary')
      revalidatePath('/reading')
      invalidateVocabularyGroupsCache()
      return result
    },
    {
      successMessage: '词条已保存',
      fallbackMessage: '词条保存失败，请保留当前内容后重试',
    },
  )
}
