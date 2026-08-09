'use client'

import { useEffect, useRef, type ReactNode } from 'react'

export default function QuestionSectionAnchor({
  children,
}: {
  children: ReactNode
}) {
  const sectionRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (window.location.hash !== '#questions') return

    const scrollToQuestions = () => {
      sectionRef.current?.scrollIntoView({ block: 'start' })
    }
    const firstFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(scrollToQuestions)
    })
    const settleTimer = window.setTimeout(scrollToQuestions, 350)

    return () => {
      window.cancelAnimationFrame(firstFrame)
      window.clearTimeout(settleTimer)
    }
  }, [])

  return (
    <div
      id='questions'
      ref={sectionRef}
      className='min-h-[calc(100vh-5rem)] scroll-mt-20'>
      {children}
    </div>
  )
}
