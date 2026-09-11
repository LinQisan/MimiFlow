'use client'

import { useState, type ReactNode, type SyntheticEvent } from 'react'

export default function DeferredDetails({
  className,
  summary,
  children,
}: {
  className: string
  summary: ReactNode
  children: ReactNode
}) {
  const [hasOpened, setHasOpened] = useState(false)

  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (event.currentTarget.open && !hasOpened) setHasOpened(true)
  }

  return (
    <details className={className} onToggle={handleToggle}>
      {summary}
      {hasOpened ? children : null}
    </details>
  )
}
