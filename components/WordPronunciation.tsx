'use client'

import { guessLanguageCode } from '@/utils/langDetector'
import { buildJapaneseRubyHtml } from '@/utils/japaneseRuby'

export default function WordPronunciation({
  word,
  pronunciation,
  showPronunciation = true,
  meanings = [],
  showMeaning = false,
  wordClassName = '',
  hintClassName = '',
  meaningClassName = '',
}: {
  word: string
  pronunciation?: string
  showPronunciation?: boolean
  meanings?: string[]
  showMeaning?: boolean
  wordClassName?: string
  hintClassName?: string
  meaningClassName?: string
}) {
  const lang = guessLanguageCode(word)
  const pron = pronunciation?.trim() || ''
  const shouldShowHint = showPronunciation && !!pron
  const parsedMeanings = meanings.map(item => item.trim()).filter(Boolean)
  const shouldShowMeaning = showMeaning && parsedMeanings.length > 0

  if (lang === 'ja') {
    if (!shouldShowHint) {
      return <div className={wordClassName}>{word}</div>
    }
    const rubyHtml = buildJapaneseRubyHtml(word, pron, {
      rubyClassName: wordClassName,
      rtClassName: hintClassName,
    })
    return <span dangerouslySetInnerHTML={{ __html: rubyHtml }} />
  }

  if (lang === 'en') {
    return (
      <div>
        <div className={wordClassName}>{word}</div>
        {shouldShowHint && <div className={hintClassName}>/{pron}/</div>}
      </div>
    )
  }

  return (
    <div className={wordClassName}>{word}</div>
  )
}
