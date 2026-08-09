'use client'

import {
  addVocabularySentence,
  assignVocabularySentenceMeaning,
  clearVocabularySentenceMeaning,
  deleteVocabulary,
  deleteVocabularySentence,
  searchSentencesForWord,
  updateVocabularyPartsOfSpeechById,
  updateVocabularyPronunciationById,
  updateVocabularySentencePosTags,
  updateVocabularyTags,
} from '@/modules/knowledge/vocabulary/actions'
import {
  addVocabulariesToWordbook,
  createWordbook,
  moveWordbook,
  renameWordbook,
} from '@/modules/knowledge/wordbooks/actions'
import { rateVocabularyMemory } from '@/modules/review/actions/memory'

export function useVocabularyMutations() {
  return {
    addVocabularySentence,
    assignVocabularySentenceMeaning,
    clearVocabularySentenceMeaning,
    deleteVocabulary,
    deleteVocabularySentence,
    searchSentencesForWord,
    updateVocabularyPartsOfSpeechById,
    updateVocabularyPronunciationById,
    updateVocabularySentencePosTags,
    updateVocabularyTags,
    addVocabulariesToWordbook,
    createWordbook,
    moveWordbook,
    renameWordbook,
    rateVocabularyMemory,
  }
}
