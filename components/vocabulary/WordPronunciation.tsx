'use client'

import { guessLanguageCode } from '@/utils/language/langDetector'
import { buildJapaneseRubyHtml } from '@/utils/language/japaneseRuby'

export default function WordPronunciation({
  word,
  pronunciation,
  pronunciations = [],
  showPronunciation = true,
  meanings = [],
  showMeaning = false,
  wordClassName = '',
  hintClassName = '',
  meaningClassName = '',
}: {
  word: string
  pronunciation?: string
  pronunciations?: string[]
  showPronunciation?: boolean
  meanings?: string[]
  showMeaning?: boolean
  wordClassName?: string
  hintClassName?: string
  meaningClassName?: string
}) {
  const lang = guessLanguageCode(word)
  const pron =
    (pronunciation || '').trim() ||
    pronunciations.map(item => item.trim()).find(Boolean) ||
    ''
  const shouldShowHint = showPronunciation && !!pron
  const hasKanji = /[\u4e00-\u9fff]/.test(word)
  const parsedMeanings = meanings.map(item => item.trim()).filter(Boolean)
  const shouldShowMeaning = showMeaning && parsedMeanings.length > 0
  const hasKana = /[\u3040-\u30ff]/.test(word)
  const hasKanaInPron = /[\u3040-\u30ff]/.test(pron)
  const isJapaneseWord = hasKana || hasKanaInPron || lang === 'ja'
  const isChineseWord = lang === 'zh' && !isJapaneseWord
  const baseWordClass = isJapaneseWord
    ? `font-word-ja ${wordClassName}`.trim()
    : lang === 'en'
      ? `font-word-en ${wordClassName}`.trim()
      : isChineseWord
        ? `font-word-zh ${wordClassName}`.trim()
        : wordClassName

  // 仅对日语词（含汉字）使用 ruby；中文词保留普通注音展示，避免错误注音布局。
  if (hasKanji && isJapaneseWord) {
    if (!shouldShowHint) {
      return <div className={baseWordClass}>{word}</div>
    }
    const rubyHtml = buildJapaneseRubyHtml(word, pron, {
      rubyClassName: `${baseWordClass} jp-ruby`.trim(),
      rtClassName: `jp-ruby-rt ${hintClassName}`.trim(),
    })
    return <span dangerouslySetInnerHTML={{ __html: rubyHtml }} />
  }

  if (lang === 'en') {
    return (
      <div>
        <div className={baseWordClass}>{word}</div>
        {shouldShowHint && <div className={hintClassName}>/{pron}/</div>}
      </div>
    )
  }

  if (isJapaneseWord) {
    return (
      <div>
        {shouldShowHint && <div className={hintClassName}>{pron}</div>}
        <div className={baseWordClass}>{word}</div>
      </div>
    )
  }

  if (shouldShowHint) {
    return (
      <div>
        <div className={baseWordClass}>{word}</div>
        <div className={hintClassName}>{pron}</div>
      </div>
    )
  }

  return (
    <div className={baseWordClass}>{word}</div>
  )
}
