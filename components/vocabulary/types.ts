export type WordLevel = 'N1' | 'N2' | 'N3' | 'N4' | 'N5'
export type LearnStatus = 'new' | 'learning' | 'mastered'
export type Density = 'comfortable' | 'compact'

export interface VocabWord {
  id: string
  word: string
  /** 假名读音：读音列常驻，注音开关只控制单词行的振り仮名（CSS 显隐） */
  etymologies?: string[]
  reading: string
  meaning: string
  bookName: string
  unit: string
  bookId?: string
  level: WordLevel | null
  status: LearnStatus
  audioUrl?: string | null
  isFavorite?: boolean
}

export interface FilterState {
  lang: string
  q: string
  sort: string
  pos: string
  tag: string
  book: string
  page: number
}

export interface OptionItem {
  value: string
  label: string
}
