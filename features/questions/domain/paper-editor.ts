export const MATERIAL_GROUPS = [
  {
    key: 'LISTENING',
    title: '聴解',
  },
  {
    key: 'READING',
    title: '読解',
  },
  {
    key: 'VOCAB_GRAMMAR',
    title: '文字・語彙・文法',
  },
] as const

export function parseActiveQuestionSection(sectionKey?: string | null) {
  if (!sectionKey) return null
  if (sectionKey === 'READING' || sectionKey === 'VOCAB_GRAMMAR') {
    return { materialType: sectionKey, listeningSectionKey: null }
  }
  if (sectionKey.startsWith('LISTENING:')) {
    return {
      materialType: 'LISTENING',
      listeningSectionKey: sectionKey.slice('LISTENING:'.length),
    }
  }
  if (sectionKey === 'LISTENING') {
    return { materialType: 'LISTENING', listeningSectionKey: null }
  }
  return null
}
