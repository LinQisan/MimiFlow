import type { PronunciationSource } from '@/components/ui/PronunciationSourceSelector'

/**
 * Pure initial-state mapping for the sudachi|personal preference, shared by
 * reading / practice / listening / vocabulary. Zero runtime dependencies so
 * it can be unit tested directly.
 *
 * NOTE: the stateful hook deliberately does NOT re-apply this mapping on
 * every `available` change — transient unavailability (refetch, remount)
 * must never downgrade an already-resolved 'sudachi'. Only an explicit
 * stored 'personal', or fresh availability, moves the state.
 *
 * - An explicit stored `'personal'` choice always wins.
 * - Otherwise automatic (Sudachi) reading is used as soon as it is available,
 *   including first-time users with no stored preference.
 * - When automatic reading is unavailable, each page keeps its SSR-provided
 *   `initialSource` instead of flipping state during hydration.
 */
export const resolvePronunciationSource = (
  stored: string | null,
  available: boolean,
  initialSource: PronunciationSource = 'personal',
): PronunciationSource => {
  if (stored === 'personal') return 'personal'
  if (available) return 'sudachi'
  return initialSource
}
