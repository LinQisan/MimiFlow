'use client'

import 'katex/dist/katex.min.css'

import katex from 'katex'
import { useMemo } from 'react'

export default function MathExpression({
  expression,
  displayMode = false,
}: {
  expression: string
  displayMode?: boolean
}) {
  const html = useMemo(
    () =>
      katex.renderToString(expression, {
        displayMode,
        throwOnError: false,
        strict: 'warn',
        trust: false,
        output: 'htmlAndMathml',
      }),
    [displayMode, expression],
  )

  return (
    <span
      className={displayMode ? 'block overflow-x-auto py-3 text-center' : 'mx-0.5 inline-block'}
      aria-label={expression}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
