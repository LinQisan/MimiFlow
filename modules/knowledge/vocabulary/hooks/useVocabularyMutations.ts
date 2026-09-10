'use client'

import {
  addVocabularySentence,
  searchSentencesForWord,
  updateVocabularyTags,
} from '@/modules/knowledge/vocabulary/actions'
import {
  addVocabulariesToWordbook,
} from '@/modules/knowledge/wordbooks/actions'
import { rateVocabularyMemory } from '@/modules/review/actions/memory'

export function useVocabularyMutations() {
  return {
    addVocabularySentence,
    searchSentencesForWord,
    updateVocabularyTags,
    addVocabulariesToWordbook,
    rateVocabularyMemory,
  }
}
