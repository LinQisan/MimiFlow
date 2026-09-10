import type { LearnStatus } from './types'
import { cn } from '@/lib/cn'

const STATUS_META: Record<LearnStatus, { dot: string; label: string }> = {
  new: { dot: 'bg-status-new', label: '未学' },
  learning: { dot: 'bg-status-learning', label: '学习中' },
  mastered: { dot: 'bg-status-mastered', label: '已掌握' },
}

export default function StatusDot({ status }: { status: LearnStatus }) {
  const meta = STATUS_META[status]
  return <span title={meta.label} aria-label={meta.label} role='img' className={cn('inline-block size-2 rounded-full', meta.dot)} />
}
