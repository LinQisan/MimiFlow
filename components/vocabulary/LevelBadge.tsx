import type { WordLevel } from './types'
import { cn } from '@/lib/cn'

/** 完整静态类名，Purge 安全（禁止模板拼接） */
export const levelStyles: Record<WordLevel, string> = {
  N1: 'bg-n1 text-n1-fg',
  N2: 'bg-n2 text-n2-fg',
  N3: 'bg-n3 text-n3-fg',
  N4: 'bg-n4 text-n4-fg',
  N5: 'bg-n5 text-n5-fg',
}

export default function LevelBadge({ level }: { level: WordLevel | null }) {
  if (!level) return null
  return (
    <span className={cn('inline-flex h-[22px] items-center px-2 rounded-full text-xs font-semibold', levelStyles[level])}>
      {level}
    </span>
  )
}
