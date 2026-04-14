import { MaterialType } from '@prisma/client'

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

function toLegacyId(materialId: string): string {
  const idx = materialId.indexOf(':')
  return idx >= 0 ? materialId.slice(idx + 1) : materialId
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
    return '/exam/papers/custom'
  }
  return '/exam/papers'
}

function resolveMaterialEntry(
  type: MaterialType,
  materialId: string,
  learningMode?: string | null,
): string {
  const legacyId = toLegacyId(materialId)
  if (type === MaterialType.LISTENING) return `/shadowing/${legacyId}`
  if (type === MaterialType.READING) return `/articles/${legacyId}`
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
        secondary: { href: '/shadowing', label: '查看听力列表' },
      }
    }
    if (completed) {
      return {
        primary: { href: materialEntry, label: '复习本材料' },
        secondary: { href: '/review', label: '去错题回顾' },
      }
    }
    return {
      primary: { href: materialEntry, label: '继续学习' },
      secondary: { href: '/shadowing', label: '切换材料' },
    }
  }

  if (input.type === MaterialType.READING) {
    if (!started) {
      return {
        primary: { href: materialEntry, label: '开始学习' },
        secondary: { href: '/articles', label: '查看阅读列表' },
      }
    }
    if (completed) {
      return {
        primary: { href: materialEntry, label: '复习本材料' },
        secondary: { href: '/review', label: '去错题回顾' },
      }
    }
    return {
      primary: { href: materialEntry, label: '继续学习' },
      secondary: { href: '/articles', label: '切换材料' },
    }
  }

  if (!started) {
    return {
      primary: { href: materialEntry, label: '开始训练' },
      secondary: { href: '/exam/papers/custom', label: '随机练习' },
    }
  }
  if (completed) {
    return {
      primary: { href: materialEntry, label: '再做一轮' },
      secondary: { href: '/exam/papers', label: '查看套卷库' },
    }
  }
  return {
    primary: { href: materialEntry, label: '继续训练' },
    secondary: { href: '/exam/papers/custom', label: '随机练习' },
  }
}
