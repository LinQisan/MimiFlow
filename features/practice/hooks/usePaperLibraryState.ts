'use client'

import { useCallback, useReducer, type SetStateAction } from 'react'

type State = {
  query: string
  language: string
  level: string
}

type Action = {
  [Key in keyof State]: {
    key: Key
    value: SetStateAction<State[Key]>
  }
}[keyof State]

function reducer(state: State, action: Action) {
  const current = state[action.key]
  const next =
    typeof action.value === 'function'
      ? (action.value as (value: typeof current) => typeof current)(current)
      : action.value
  return { ...state, [action.key]: next }
}

export function usePaperLibraryState() {
  const [state, dispatch] = useReducer(reducer, {
    query: '',
    language: 'all',
    level: 'all',
  })
  const setter = useCallback(
    <Key extends keyof State>(key: Key) =>
      (value: SetStateAction<State[Key]>) => dispatch({ key, value } as Action),
    [],
  )
  const reset = useCallback(() => {
    dispatch({ key: 'query', value: '' })
    dispatch({ key: 'language', value: 'all' })
    dispatch({ key: 'level', value: 'all' })
  }, [])

  return {
    ...state,
    setQuery: setter('query'),
    setLanguage: setter('language'),
    setLevel: setter('level'),
    reset,
  }
}
