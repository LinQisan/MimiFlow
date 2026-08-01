import { Card, State, createEmptyCard } from 'ts-fsrs'

export type StoredFsrsCard = {
  due: Date
  state: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  reps: number
  lapses: number
  last_review: Date | null
}

export const toFsrsCard = (record: StoredFsrsCard): Card => ({
  ...createEmptyCard(),
  due: record.due,
  state: record.state as State,
  stability: record.stability,
  difficulty: record.difficulty,
  elapsed_days: record.elapsed_days,
  scheduled_days: record.scheduled_days,
  reps: record.reps,
  lapses: record.lapses,
  last_review: record.last_review || undefined,
})

export const toStoredFsrsUpdate = (card: Card) => ({
  due: card.due,
  state: card.state,
  stability: card.stability,
  difficulty: card.difficulty,
  elapsed_days: card.elapsed_days,
  scheduled_days: card.scheduled_days,
  reps: card.reps,
  lapses: card.lapses,
  learning_steps: (card as { learning_steps?: number }).learning_steps ?? 0,
  last_review: card.last_review || null,
})
