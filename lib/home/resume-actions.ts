import { MaterialType } from '#prisma-client'

type ResumeAction = {
  href: string
  label: string
}

type ResumeActions = {
  primary: ResumeAction
  secondary: ResumeAction
}

type ResolveResumeActionsInput = {
  type: MaterialType
  materialId: string
  progressPercent?: number | null
  lastPosition?: string | null
  learningMode?: string | null
}

function normalizeProgress(progressPercent?: number | null): number {
  if (typeof progressPercent !== 'number' || Number.isNaN(progressPercent)) {
    return 0
  }
  return Math.max(0, Math.min(100, progressPercent))
}

function resolveQuizEntryByMode(learningMode?: string | null): string {
  const mode = (learningMode || '').trim().toLowerCase()
  if (mode.includes('custom') || mode.includes('random')) {
    return '/practice/custom'
  }
  return '/practice'
}

function resolveMaterialEntry(
  type: MaterialType,
  materialId: string,
  learningMode?: string | null,
): string {
  if (type === MaterialType.LISTENING) return `/listening/${materialId}`
  if (type === MaterialType.MEDIA_SUBTITLE) return `/subtitles/${materialId}`
  if (type === MaterialType.READING) return `/reading/articles/${materialId}`
  return resolveQuizEntryByMode(learningMode)
}

export function resolveResumeActions(
  input: ResolveResumeActionsInput,
): ResumeActions {
  const progress = normalizeProgress(input.progressPercent)
  const hasPosition = Boolean((input.lastPosition || '').trim())
  const started = progress > 0 || hasPosition
  const completed = progress >= 98
  const materialEntry = resolveMaterialEntry(
    input.type,
    input.materialId,
    input.learningMode,
  )

  if (input.type === MaterialType.LISTENING) {
    if (!started) {
      return {
        primary: { href: materialEntry, label: '开始学习' },
        secondary: { href: '/listening', label: '查看听力列表' },
      }
    }
    if (completed) {
      return {
        primary: { href: materialEntry, label: '复习本材料' },
        secondary: { href: '/review/mistakes', label: '去错题回顾' },
      }
    }
    return {
      primary: { href: materialEntry, label: '继续学习' },
      secondary: { href: '/listening', label: '切换材料' },
    }
  }

  if (input.type === MaterialType.MEDIA_SUBTITLE) {
    if (!started) {
      return {
        primary: { href: materialEntry, label: '开始浏览' },
        secondary: { href: '/subtitles', label: '查看字幕库' },
      }
    }
    return {
      primary: { href: materialEntry, label: '继续浏览' },
      secondary: { href: '/subtitles', label: '切换作品' },
    }
  }

  if (input.type === MaterialType.READING) {
    if (!started) {
      return {
        primary: { href: materialEntry, label: '开始学习' },
        secondary: { href: '/reading?tab=articles', label: '查看阅读中心' },
      }
    }
    if (completed) {
      return {
        primary: { href: materialEntry, label: '复习本材料' },
        secondary: { href: '/review/mistakes', label: '去错题回顾' },
      }
    }
    return {
      primary: { href: materialEntry, label: '继续学习' },
      secondary: { href: '/reading?tab=articles', label: '切换材料' },
    }
  }

  if (!started) {
    return {
      primary: { href: materialEntry, label: '开始训练' },
      secondary: { href: '/practice/custom', label: '随机练习' },
    }
  }
  if (completed) {
    return {
      primary: { href: materialEntry, label: '再做一轮' },
      secondary: { href: '/practice', label: '查看套卷库' },
    }
  }
  return {
    primary: { href: materialEntry, label: '继续训练' },
    secondary: { href: '/practice/custom', label: '随机练习' },
  }
}
