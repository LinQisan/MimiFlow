'use client'

import { splitJapaneseEtymologies } from '@/modules/language/domain/etymology'

import { guessLanguageCode } from '@/utils/language/langDetector'
import {
  annotateJapaneseTextWithSudachi,
  buildJapaneseRubyHtml,
  type JapaneseRubyLexeme,
} from '@/utils/language/japaneseRuby'
import TrustedHtml from '@/components/ui/TrustedHtml'
import {
  getVocabularyDisplayPronunciations,
  selectVocabularyDisplayPronunciation,
} from '@/utils/text/pronunciation'
import { splitVocabularyHeadwordVariants } from '@/utils/vocabulary/vocabularyCanonical'
import {
  renderRubySegmentsHtml,
  type VocabularyPronunciationData,
} from '@/modules/knowledge/vocabulary/domain/pronunciation'

function WordPronunciationText({
  word,
  pronunciation,
  pronunciations = [],
  pronunciationData,
  showPronunciation = true,
  meanings = [],
  showMeaning = false,
  wordClassName = '',
  variantGroupClassName = '',
  hintClassName = '',
  meaningClassName = '',
  pronunciationSource = 'personal',
  sudachiLexicon = {},
}: {
  word: string
  pronunciation?: string
  pronunciations?: string[]
  pronunciationData?: VocabularyPronunciationData | null
  showPronunciation?: boolean
  meanings?: string[]
  showMeaning?: boolean
  wordClassName?: string
  variantGroupClassName?: string
  hintClassName?: string
  meaningClassName?: string
  pronunciationSource?: 'sudachi' | 'personal'
  sudachiLexicon?: Record<string, JapaneseRubyLexeme>
}) {
  const lang = guessLanguageCode(word)
  const pron = selectVocabularyDisplayPronunciation(word, [
    pronunciation || '',
    ...pronunciations,
  ])
  const authoredPronunciations = getVocabularyDisplayPronunciations(word, [
    pronunciation || '',
    ...pronunciations,
  ])
  const hasKanji = /[\u4e00-\u9fff]/.test(word)
  const hasPrecomputedPronunciation = Boolean(
    pronunciationData?.segments &&
      pronunciationData.segments.map(segment => segment.text).join('') === word &&
      pronunciationData.segments.some(seg => Boolean(seg.reading)),
  )
  const usablePronunciationData = hasPrecomputedPronunciation
    ? pronunciationData
    : null
  const hasSudachiPronunciation =
    hasPrecomputedPronunciation ||
    Object.values(sudachiLexicon).some(
      lexeme =>
        /[\u4e00-\u9fff]/.test(lexeme.surface) &&
        word.includes(lexeme.surface) &&
        Boolean(lexeme.reading.trim()),
    )
  const shouldShowHint =
    showPronunciation &&
    (pronunciationSource === 'sudachi'
      ? hasSudachiPronunciation
      : Boolean(pron || usablePronunciationData?.reading))
  const parsedMeanings = meanings.map(item => item.trim()).filter(Boolean)
  const headwordVariants = splitVocabularyHeadwordVariants(word)
  const shouldShowMeaning = showMeaning && parsedMeanings.length > 0
  const hasKana = /[\u3040-\u30ff]/.test(word)
  const hasKanaInPron = /[\u3040-\u30ff]/.test(pron)
  const isJapaneseWord =
    hasSudachiPronunciation || hasKana || hasKanaInPron || lang === 'ja'
  const isChineseWord = lang === 'zh' && !isJapaneseWord
  const renderAuthoredReadings = () => {
    if (!showPronunciation || !isJapaneseWord || authoredPronunciations.length === 0) {
      return null
    }
    const sudachiReadingDiffers =
      pronunciationSource === 'sudachi' &&
      Boolean(usablePronunciationData?.reading) &&
      authoredPronunciations.some(
        value => value !== usablePronunciationData?.reading,
      )
    if (authoredPronunciations.length < 2 && !sudachiReadingDiffers) return null
    return (
      <div
        aria-label='已保存读音'
        className={`${hintClassName} mt-1 flex flex-wrap justify-center gap-x-1.5 gap-y-0.5`}
      >
        {authoredPronunciations.map((value, index) => (
          <span key={`${value}-${index}`}>
            {index > 0 ? <span aria-hidden='true'> / </span> : null}
            {value}
          </span>
        ))}
      </div>
    )
  }
  const renderMeanings = () =>
    shouldShowMeaning ? (
      <div className={meaningClassName}>{parsedMeanings.join(' / ')}</div>
    ) : null
  const baseWordClass = isJapaneseWord
    ? `font-word-ja ${wordClassName}`.trim()
    : lang === 'en'
      ? `font-word-en ${wordClassName}`.trim()
      : isChineseWord
        ? `font-word-zh ${wordClassName}`.trim()
        : wordClassName

  if (isJapaneseWord && headwordVariants.length > 1) {
    const variantPronunciations = pronunciations
      .map(item => item.trim())
      .filter(Boolean)
    return (
      <div>
        {!hasKanji && shouldShowHint ? (
          <div className={hintClassName}>{pron}</div>
        ) : null}
        <div className={`flex flex-wrap items-end gap-x-2 gap-y-1 ${variantGroupClassName}`.trim()}>
          {headwordVariants.map((variant, index) => {
            const variantHasKanji = /[\u4e00-\u9fff]/.test(variant)
            const variantPronunciation =
              variantPronunciations.length === headwordVariants.length
                ? variantPronunciations[index]
                : pron
            const variantHtml =
              pronunciationSource === 'sudachi' &&
              Object.keys(sudachiLexicon).length > 0
                ? annotateJapaneseTextWithSudachi(variant, sudachiLexicon, {
                    useSudachiReading: true,
                    rubyEnabled: true,
                    rubyClassName: 'jp-ruby',
                    rtClassName: `jp-ruby-rt ${hintClassName}`.trim(),
                  })
                : buildJapaneseRubyHtml(variant, variantPronunciation, {
                    rubyClassName: 'jp-ruby',
                    rtClassName: `jp-ruby-rt ${hintClassName}`.trim(),
                  })
            return (
              <span key={variant} className='inline-flex items-end gap-2'>
                {index > 0 ? (
                  <span className='font-normal text-slate-300' aria-hidden='true'>
                    /
                  </span>
                ) : null}
                {shouldShowHint && variantHasKanji ? (
                  <TrustedHtml className={baseWordClass} html={variantHtml} />
                ) : (
                  <span className={baseWordClass}>{variant}</span>
                )}
              </span>
            )
          })}
        </div>
        {renderAuthoredReadings()}
        {renderMeanings()}
      </div>
    )
  }

  // 仅对日语词（含汉字）使用 ruby；中文词保留普通注音展示，避免错误注音布局。
  if (hasKanji && isJapaneseWord) {
    if (!shouldShowHint) {
      return (
        <div>
          <div className={baseWordClass}>{word}</div>
          {renderMeanings()}
        </div>
      )
    }
    const rubyHtml =
      pronunciationSource === 'sudachi'
        ? hasPrecomputedPronunciation
          ? renderRubySegmentsHtml(pronunciationData!.segments, {
              rubyClassName: 'jp-ruby',
              rtClassName: `jp-ruby-rt ${hintClassName}`.trim(),
            })
          : Object.keys(sudachiLexicon).length > 0
            ? annotateJapaneseTextWithSudachi(word, sudachiLexicon, {
                useSudachiReading: true,
                rubyEnabled: true,
                rubyClassName: 'jp-ruby',
                rtClassName: `jp-ruby-rt ${hintClassName}`.trim(),
              })
            : buildJapaneseRubyHtml(word, pron || usablePronunciationData?.reading || '', {
                rubyClassName: 'jp-ruby',
                rtClassName: `jp-ruby-rt ${hintClassName}`.trim(),
              })
        : buildJapaneseRubyHtml(word, pron || usablePronunciationData?.reading || '', {
            rubyClassName: 'jp-ruby',
            rtClassName: `jp-ruby-rt ${hintClassName}`.trim(),
          })
    return (
      <div>
        <TrustedHtml
          className={baseWordClass}
          html={rubyHtml}
        />
        {renderAuthoredReadings()}
        {renderMeanings()}
      </div>
    )
  }

  if (lang === 'en') {
    return (
      <div>
        <div className={baseWordClass}>{word}</div>
        {shouldShowHint && <div className={hintClassName}>/{pron}/</div>}
        {renderMeanings()}
      </div>
    )
  }

  if (isJapaneseWord) {
    return (
      <div>
        {shouldShowHint && <div className={hintClassName}>{pron}</div>}
        <div className={baseWordClass}>{word}</div>
        {renderAuthoredReadings()}
        {renderMeanings()}
      </div>
    )
  }

  if (shouldShowHint) {
    return (
      <div>
        <div className={baseWordClass}>{word}</div>
        <div className={hintClassName}>{pron}</div>
        {renderMeanings()}
      </div>
    )
  }

  return (
    <div>
      <div className={baseWordClass}>{word}</div>
      {renderMeanings()}
    </div>
  )
}

export default function WordPronunciation(props: Parameters<typeof WordPronunciationText>[0] & { etymologies?: string[] }) {
  const primary = splitJapaneseEtymologies(props.word, [props.pronunciation || ''])
  const { pronunciations, etymologies } = splitJapaneseEtymologies(
    props.word, props.pronunciations || [], [...(props.etymologies || []), ...primary.etymologies],
  )
  return (
    <div>
      <WordPronunciationText {...props} pronunciation={primary.pronunciations[0] || ''} pronunciations={pronunciations} />
      {etymologies.length > 0 ? <p className='mt-1 text-xs font-normal text-slate-500'>词源：{etymologies.join(' · ')}</p> : null}
    </div>
  )
}
