export const MATERIAL_TYPE_LABEL: Record<string, string> = {
  READING: '読解',
  LISTENING: '聴解',
  VOCAB_GRAMMAR: '文字・語彙・文法',
  SPEAKING: '発話',
}

export const MATERIAL_GROUPS = [
  {
    key: 'LISTENING',
    title: '聴解',
    description: '按問題检查听力音频、题目和选项。',
  },
  {
    key: 'READING',
    title: '読解',
    description: '检查文章与内容理解、文章穴埋め题。',
  },
  {
    key: 'VOCAB_GRAMMAR',
    title: '文字・語彙・文法',
    description: '检查漢字読み、言い換え類義、用法与文法题。',
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
