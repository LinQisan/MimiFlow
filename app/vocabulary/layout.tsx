import type { ReactNode } from 'react'
import VocabularyRefreshOnReturn from '@/modules/knowledge/vocabulary/components/VocabularyRefreshOnReturn'

export default function VocabularyLayout({ children }: { children: ReactNode }) {
  return <><VocabularyRefreshOnReturn />{children}</>
}
