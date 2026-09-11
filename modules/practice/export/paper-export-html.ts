import { formatOptionLabel } from '../../../utils/questions/optionLabels.ts'
import { resolveJapaneseTargetSurface } from '../../../utils/vocabulary/japaneseInflection.ts'
import { parseArticleContentBlocks } from '../../reading/domain/article-blocks.ts'
import { parseSortingPrompt } from '../../../modules/practice/domain/question-text.ts'
import { buildPracticeQuestionNumberMap } from '../../../modules/practice/domain/question-numbering.ts'
import type {
  PaperExportData,
  PaperExportMaterial,
  PaperExportQuestion,
} from './paper-export-data'

export const escapePaperHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const textHtml = (value: string, targetWord = '') => {
  let html = escapePaperHtml(value)
  if (targetWord) {
    const escapedTarget = escapePaperHtml(targetWord)
    html = html.replaceAll(
      escapedTarget,
      `<span class="underline">${escapedTarget}</span>`,
    )
  }
  return html
    .replace(/\+\+([\s\S]+?)\+\+/g, '<span class="underline">$1</span>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>')
}

const fuzzyTargetTextHtml = (value: string, targetWord: string) => {
  if (!targetWord) return textHtml(value)
  return textHtml(value, resolveJapaneseTargetSurface(value, targetWord))
}

export const buildPaperPartQuestionNumbers = (data: PaperExportData) => {
  return buildPracticeQuestionNumberMap(
    data.sections.flatMap(section =>
      section.materials.flatMap(material =>
        material.questions.map(question => ({
          id: question.id,
          isListening: section.materialKey === 'LISTENING',
          sectionKey: section.key,
        })),
      ),
    ),
    data.language,
  )
}

const hasMarkdownTable = (value: string) => /^\s*\|.+\|\s*$/m.test(value)

const structuredTextHtml = (value: string, targetWord = '') => {
  if (!hasMarkdownTable(value)) return textHtml(value, targetWord)
  const blocks = parseArticleContentBlocks([value])
  return blocks
    .map(block => {
      if (block.type === 'table') {
        const rows = block.rows
          .map(
            (row, rowIndex) =>
              `<tr>${row
                .map((cell, cellIndex) => {
                  const tag =
                    (block.hasHeader && rowIndex === 0) ||
                    (block.hasHeader && cellIndex === 0)
                      ? 'th'
                      : 'td'
                  return `<${tag}>${textHtml(cell, targetWord)}</${tag}>`
                })
                .join('')}</tr>`,
          )
          .join('')
        return `<div class="paper-table-wrap"><table class="paper-table"><tbody>${rows}</tbody></table></div>`
      }
      if (block.type === 'math') {
        return `<div class="paper-math">${escapePaperHtml(block.expression)}</div>`
      }
      return `<p>${textHtml(block.text, targetWord)}</p>`
    })
    .join('')
}

const sortingPromptHtml = (value: string) => {
  return parseSortingPrompt(value).segments
    .map(segment =>
      segment.slotIndex === null
        ? textHtml(segment.text)
        : `<span class="sort-slot${segment.isStar ? ' has-star' : ''}">${
            segment.isStar ? '<span class="sort-star">★</span>' : ''
          }</span>`,
    )
    .join('')
}

const pageShell = (
  data: PaperExportData,
  documentTitle: string,
  body: string,
) => `<!doctype html>
<html lang="${escapePaperHtml(data.language || 'ja')}">
<head>
<meta charset="utf-8">
<title>${escapePaperHtml(documentTitle)}</title>
<style>
  @page { size: A4; }
  * { box-sizing: border-box; }
  html { color: #172033; background: white; }
  body { margin: 0; font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "Hiragino Sans GB", "PingFang SC", "Arial Unicode MS", sans-serif; font-size: 10.5pt; line-height: 1.72; }
  h1, h2, h3, p { margin-top: 0; }
  .cover { min-height: 245mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; padding: 8mm 6mm 20mm; }
  .cover-kicker { color: #64748b; font-size: 9pt; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; }
  .cover h1 { margin: 8mm 0 4mm; font-size: 27pt; line-height: 1.35; letter-spacing: .015em; color: #0f172a; }
  .cover-subtitle { max-width: 145mm; color: #475569; font-size: 11pt; }
  .cover-rule { width: 34mm; border-top: 1.5pt solid #0f172a; margin: 9mm 0 8mm; }
  .meta-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4mm 8mm; max-width: 150mm; }
  .meta-label { display: block; color: #94a3b8; font-size: 7.5pt; letter-spacing: .12em; }
  .meta-value { display: block; margin-top: 1mm; font-size: 10pt; font-weight: 700; }
  .identity { margin-top: 22mm; display: grid; grid-template-columns: 1fr 1fr; gap: 12mm; max-width: 150mm; }
  .identity span { display: block; border-bottom: .7pt solid #94a3b8; padding-bottom: 2mm; color: #64748b; font-size: 9pt; }
  .section { page-break-before: always; }
  .section:first-of-type { page-break-before: auto; }
  .section-head { border-bottom: 1.5pt solid #172033; padding: 0 0 3mm; margin-bottom: 6mm; display: flex; align-items: baseline; justify-content: space-between; gap: 8mm; }
  .section-head h2 { margin: 0; font-size: 17pt; line-height: 1.35; }
  .section-head span { color: #64748b; font-size: 8.5pt; letter-spacing: .08em; }
  .material { margin-bottom: 8mm; }
  .material-title { margin: 0 0 3mm; color: #475569; font-size: 9pt; font-weight: 700; letter-spacing: .08em; break-after: avoid; }
  .material.listening-single { break-inside: avoid; }
  .passage { margin: 0 0 8mm; padding: 0; font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "YuGothic", "Noto Sans JP", "Meiryo", sans-serif; font-size: 11pt; line-height: 2.05; letter-spacing: .012em; text-align: justify; overflow-wrap: anywhere; }
  .passage p { margin: 0 0 1.15em; }
  .passage p:last-child { margin-bottom: 0; }
  .passage-blank { display: inline-block; min-width: 13mm; margin: 0 1mm; padding: 0 2mm .5mm; border-bottom: 1.2pt solid #0f172a; color: #334155; font-weight: 650; line-height: 1.2; text-align: center; vertical-align: baseline; }
  .question { position: relative; margin: 0 0 6mm; padding-left: 10mm; break-inside: avoid; }
  .question-number { position: absolute; left: 0; top: .2mm; width: 7mm; font-weight: 800; font-size: 11pt; color: #0f172a; }
  .prompt { font-weight: 650; color: #111827; }
  .context { margin-top: 1.5mm; color: #334155; }
  .underline { display: inline-block; white-space: nowrap; text-decoration: underline; text-decoration-thickness: 1.4px; text-underline-offset: 3px; }
  .sort-slot { position: relative; display: inline-block; width: 18mm; height: 1.35em; margin: 0 1.2mm; border-bottom: 1.2pt solid #334155; vertical-align: -.12em; }
  .sort-star { position: absolute; left: 50%; bottom: 1.8mm; transform: translateX(-50%); font-size: 9.5pt; line-height: 1; }
  .question.sequence-only { min-height: 9mm; margin-bottom: 2mm; }
  .question-image { display: block; max-width: 150mm; max-height: 92mm; object-fit: contain; margin: 3mm auto 4mm; }
  .options { display: grid; grid-template-columns: 1fr; gap: 1.6mm 6mm; margin: 3mm 0 0; padding: 0; list-style: none; }
  .options.compact { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .option { display: grid; grid-template-columns: 7mm minmax(0, 1fr); align-items: start; min-height: 7mm; break-inside: avoid; }
  .option-label { font-weight: 700; }
  .option-image { display: block; max-width: 56mm; max-height: 52mm; margin-top: 2mm; object-fit: contain; }
  .paper-table-wrap { width: 100%; margin: 4mm 0; overflow: hidden; }
  .paper-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8.6pt; line-height: 1.45; font-weight: 400; }
  .paper-table th, .paper-table td { border: .65pt solid #94a3b8; padding: 2mm 2.2mm; vertical-align: top; overflow-wrap: anywhere; }
  .paper-table th { background: #eef2f6; font-weight: 700; text-align: left; }
  .paper-math { margin: 3mm 0; text-align: center; }
  .answers-title { margin: 0 0 7mm; font-size: 17pt; border-bottom: 1.5pt solid #172033; padding-bottom: 3mm; }
  .answer-group { margin: 0 0 7mm; break-inside: avoid; }
  .answer-group h2 { margin: 0 0 2.5mm; font-size: 12pt; }
  .answer-summary { width: auto; max-width: 100%; border-collapse: collapse; table-layout: fixed; }
  .answer-summary th, .answer-summary td { width: 18mm; min-width: 18mm; height: 11mm; border: .7pt solid #64748b; padding: 2mm; text-align: center; vertical-align: middle; }
  .answer-summary th { background: white; font-size: 9.5pt; }
  .answer-summary td { font-size: 10.5pt; font-weight: 800; }
  .analysis-section { page-break-before: always; }
  .analysis-section .section-head { margin-bottom: 7mm; }
  .answer-item { margin-bottom: 6mm; padding-bottom: 5mm; border-bottom: .6pt solid #cbd5e1; break-inside: avoid; }
  .answer-line { font-size: 11pt; font-weight: 800; }
  .answer-text { margin-top: 1.5mm; color: #334155; }
  .analysis { margin-top: 2.5mm; padding: 3mm 4mm; border-left: 2pt solid #94a3b8; background: #f8fafc; color: #334155; }
  .transcript-item { margin-bottom: 9mm; }
  .transcript-item h3 { margin: 0 0 1mm; font-size: 12pt; }
  .track { color: #64748b; font-size: 8.5pt; margin-bottom: 4mm; }
  .dialogue { display: grid; grid-template-columns: 13mm minmax(0, 1fr); gap: 3mm; margin-bottom: 2mm; break-inside: avoid; }
  .time { color: #94a3b8; font-size: 8pt; font-variant-numeric: tabular-nums; padding-top: .7mm; }
  .transcript-fallback p { margin-bottom: 3mm; }
  .empty { color: #94a3b8; font-style: italic; }
</style>
</head><body>${body}</body></html>`

const cover = (data: PaperExportData, kind: string, withIdentity = false) => `
<section class="cover">
  <div class="cover-kicker">${escapePaperHtml(kind)}</div>
  <h1>${escapePaperHtml(data.title)}</h1>
  ${data.description ? `<p class="cover-subtitle">${textHtml(data.description)}</p>` : ''}
  <div class="cover-rule"></div>
  <div class="meta-grid">
    <div><span class="meta-label">LANGUAGE</span><span class="meta-value">${escapePaperHtml(data.language || '未设置')}</span></div>
    <div><span class="meta-label">LEVEL</span><span class="meta-value">${escapePaperHtml(data.level || '未设置')}</span></div>
    <div><span class="meta-label">QUESTIONS</span><span class="meta-value">${data.questionCount}</span></div>
  </div>
  ${withIdentity ? '<div class="identity"><span>姓名</span><span>日期</span></div>' : ''}
</section>`

const questionOptions = (question: PaperExportQuestion) => {
  const compact =
    question.options.length <= 6 &&
    question.options.every(
      option => !option.imageDataUrl && option.text.length <= 34,
    )
  return `<ol class="options${compact ? ' compact' : ''}">${question.options
    .map((option, index) => {
      const label = formatOptionLabel(
        index,
        question.optionLabelFormat,
        question.customOptionLabels,
      )
      const promptTarget = question.prompt.replaceAll('++', '').trim()
      const optionTarget =
        question.questionType === 'WORD_DISTINCTION'
          ? question.targetWord ||
            (/^[^\s。！？、]{1,24}$/.test(promptTarget) ? promptTarget : '')
          : ''
      const optionHtml =
        question.questionType === 'WORD_DISTINCTION'
          ? fuzzyTargetTextHtml(option.text, optionTarget)
          : textHtml(option.text)
      return `<li class="option"><span class="option-label">${escapePaperHtml(label)}.</span><div>${optionHtml}${option.imageDataUrl ? `<img class="option-image" src="${option.imageDataUrl}" alt="">` : ''}</div></li>`
    })
    .join('')}</ol>`
}

const renderQuestion = (
  question: PaperExportQuestion,
  {
    sequenceOnly = false,
    displayNumber = question.localNumber,
  }: { sequenceOnly?: boolean; displayNumber?: number } = {},
) => {
  if (sequenceOnly) {
    return `<article class="question sequence-only"><span class="question-number">${displayNumber}</span></article>`
  }
  const isReadingCloze =
    question.materialType === 'READING' &&
    question.questionType === 'FILL_BLANK'
  const underlineTarget = [
    'PRONUNCIATION',
    'SYNONYM_REPLACEMENT',
    'WORD_DISTINCTION',
  ].includes(question.questionType)
    ? question.targetWord
    : ''
  const useStructuredContext = hasMarkdownTable(question.context)
  const promptSource = useStructuredContext
    ? question.context
    : question.prompt
  const promptHtml =
    question.questionType === 'SORTING'
      ? sortingPromptHtml(question.prompt)
      : structuredTextHtml(promptSource, underlineTarget)
  return `
<article class="question">
  <span class="question-number">${displayNumber}</span>
  ${question.prompt && !isReadingCloze ? `<div class="prompt">${promptHtml}</div>` : ''}
  ${question.context && question.context !== question.prompt && !isReadingCloze && !useStructuredContext ? `<div class="context">${structuredTextHtml(question.context, underlineTarget)}</div>` : ''}
  ${question.imageDataUrl ? `<img class="question-image" src="${question.imageDataUrl}" alt="题图">` : ''}
  ${questionOptions(question)}
</article>`
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const extractBlankSerial = (value: string) => {
  const match = value.match(
    /\[\s*(\d+)\s*\]|［\s*(\d+)\s*］|\(\s*(\d+)\s*\)|（\s*(\d+)\s*）|【\s*(\d+)\s*】|「\s*(\d+)\s*」|『\s*(\d+)\s*』/,
  )
  return match?.slice(1).find(Boolean) || ''
}

const replaceSerialToken = (
  value: string,
  serial: string,
  replacement: string,
) => {
  if (!serial) return { value, replaced: false }
  const escaped = escapeRegExp(serial)
  const patterns = [
    new RegExp(`\\[\\s*${escaped}\\s*\\]`),
    new RegExp(`［\\s*${escaped}\\s*］`),
    new RegExp(`\\(\\s*${escaped}\\s*\\)`),
    new RegExp(`（\\s*${escaped}\\s*）`),
    new RegExp(`【\\s*${escaped}\\s*】`),
    new RegExp(`「\\s*${escaped}\\s*」`),
    new RegExp(`『\\s*${escaped}\\s*』`),
  ]
  for (const pattern of patterns) {
    if (!pattern.test(value)) continue
    return { value: value.replace(pattern, replacement), replaced: true }
  }
  return { value, replaced: false }
}

const renderPassage = (material: PaperExportMaterial) => {
  if (!material.passageText) return ''
  let passage = material.passageText
  const markers = new Map<string, string>()
  const clozeQuestions = material.questions.filter(question =>
    ['FILL_BLANK', 'TOEIC_TEXT_COMPLETION'].includes(question.questionType),
  )

  clozeQuestions.forEach((question, index) => {
    const anchor = question.context || question.prompt
    const serial =
      extractBlankSerial(question.context) ||
      extractBlankSerial(question.prompt) ||
      String(index + 1)
    const token = `PAPERBLANKTOKEN${index}END`
    markers.set(
      token,
      `<span class="passage-blank">(${escapePaperHtml(serial)})</span>`,
    )

    const direct = replaceSerialToken(passage, serial, token)
    passage = direct.value
    if (direct.replaced || !anchor || !passage.includes(anchor)) return

    let anchored = anchor
    const anchorToken = replaceSerialToken(anchored, serial, token)
    anchored = anchorToken.value
    if (!anchorToken.replaced) {
      const correctOption = question.options.find(option =>
        question.answerIds.includes(option.id),
      )
      const answerText = correctOption?.text.trim() || ''
      anchored = answerText && anchored.includes(answerText)
        ? anchored.replace(answerText, token)
        : `${anchored}${token}`
    }
    passage = passage.replace(anchor, anchored)
  })

  let html = hasMarkdownTable(passage)
    ? structuredTextHtml(passage)
    : `<p>${textHtml(passage)}</p>`
  markers.forEach((markup, token) => {
    html = html.replaceAll(token, markup)
  })
  return `<article class="passage">${html}</article>`
}

export function renderQuestionPaperHtml(data: PaperExportData) {
  const isJapanese =
    data.language.toLowerCase() === 'ja' ||
    data.language.toLowerCase().startsWith('ja-')
  const questionNumbers = buildPaperPartQuestionNumbers(data)
  const sections = data.sections
    .map(
      section => {
        const sequenceOnly =
          isJapanese &&
          section.materialKey === 'LISTENING' &&
          [3, 4].includes(section.sectionNumber)
        return `<section class="section">
        <header class="section-head"><h2>${escapePaperHtml(section.heading)}</h2><span>${escapePaperHtml(section.materialTitle)}</span></header>
        ${section.materials
          .map(
            material => `<div class="material${material.type === 'LISTENING' && material.questions.length === 1 ? ' listening-single' : ''}">
              ${!sequenceOnly && material.type !== 'VOCAB_GRAMMAR' && section.materials.length > 1 ? `<h3 class="material-title">${escapePaperHtml(material.title)}</h3>` : ''}
              ${renderPassage(material)}
              ${material.questions.map(question => renderQuestion(question, { sequenceOnly, displayNumber: questionNumbers.get(question.id) })).join('')}
            </div>`,
          )
          .join('')}
      </section>`
      },
    )
    .join('')
  return pageShell(
    data,
    `${data.title} - 试题`,
    cover(data, 'QUESTION PAPER', true) + sections,
  )
}

const answerForQuestion = (question: PaperExportQuestion) => {
  if (question.questionType === 'SORTING' && question.sortingOrder.length) {
    return question.sortingOrder
      .map(index => question.options[index]?.text)
      .filter(Boolean)
      .join(' → ')
  }
  return (
    question.options
      .map((option, index) =>
        question.answerIds.includes(option.id)
          ? `${formatOptionLabel(index, question.optionLabelFormat, question.customOptionLabels)}${option.text ? `（${option.text}）` : ''}`
          : '',
      )
      .filter(Boolean)
      .join('、') || '未设置答案'
  )
}

const shortAnswerForQuestion = (question: PaperExportQuestion) =>
  question.options
    .map((option, index) =>
      question.answerIds.includes(option.id)
        ? formatOptionLabel(
            index,
            question.optionLabelFormat,
            question.customOptionLabels,
          )
        : '',
    )
    .filter(Boolean)
    .join('、') || '—'

export function renderAnswerPaperHtml(data: PaperExportData) {
  const questionNumbers = buildPaperPartQuestionNumbers(data)
  const answerGroups = data.sections
    .map(section => {
      const questions = section.materials.flatMap(material => material.questions)
      const tables = []
      for (let index = 0; index < questions.length; index += 10) {
        const group = questions.slice(index, index + 10)
        tables.push(`<table class="answer-summary"><tbody>
          <tr>${group.map(question => `<th>${questionNumbers.get(question.id)}</th>`).join('')}</tr>
          <tr>${group.map(question => `<td>${escapePaperHtml(shortAnswerForQuestion(question))}</td>`).join('')}</tr>
        </tbody></table>`)
      }
      return `<section class="answer-group">
        <h2>${escapePaperHtml(section.heading)}</h2>
        ${tables.join('')}
      </section>`
    })
    .join('')
  const explanations = data.sections
    .flatMap(section =>
      section.materials.flatMap(material =>
        material.questions
          .filter(question => question.analysis.trim())
          .map(
            question => `<article class="answer-item">
              <div class="answer-line">${questionNumbers.get(question.id)}. ${escapePaperHtml(answerForQuestion(question))}</div>
              <div class="analysis"><strong>解析</strong><br>${textHtml(question.analysis)}</div>
            </article>`,
          ),
      ),
    )
    .join('')
  const body = `<section class="section">
      <h1 class="answers-title">参考答案</h1>
      ${answerGroups}
    </section>
    ${explanations ? `<section class="section analysis-section"><header class="section-head"><h2>解析</h2><span>有解析的题目</span></header>${explanations}</section>` : ''}`
  return pageShell(
    data,
    `${data.title} - 答案与解析`,
    cover(data, 'ANSWER KEY') + body,
  )
}

const timeLabel = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

export function renderTranscriptPaperHtml(data: PaperExportData) {
  const isEnglish =
    data.language.toLowerCase() === 'en' ||
    data.language.toLowerCase().startsWith('en-')
  const listeningSections = data.sections.filter(
    section => section.materialKey === 'LISTENING',
  )
  const questionNumbers = buildPaperPartQuestionNumbers(data)
  const sections = listeningSections.length
    ? listeningSections
        .map(
          section => `<section class="section">
          <header class="section-head"><h2>${escapePaperHtml(section.heading)}</h2><span>听力原文</span></header>
          ${section.materials
            .map(material => {
              const range =
                material.questions.length === 1
                  ? isEnglish
                    ? `Question ${questionNumbers.get(material.questions[0].id)}`
                    : `第 ${questionNumbers.get(material.questions[0].id)} 题`
                  : isEnglish
                    ? `Questions ${questionNumbers.get(material.questions[0].id)}-${questionNumbers.get(material.questions.at(-1)!.id)}`
                    : `第 ${questionNumbers.get(material.questions[0].id)}-${questionNumbers.get(material.questions.at(-1)!.id)} 题`
              const transcript = material.dialogues.length
                ? material.dialogues
                    .map(
                      dialogue => `<div class="dialogue"><span class="time">${timeLabel(dialogue.start)}</span><div>${textHtml(dialogue.text)}</div></div>`,
                    )
                    .join('')
                : material.transcript
                  ? `<div class="transcript-fallback"><p>${textHtml(material.transcript)}</p></div>`
                  : '<p class="empty">该听力材料暂未录入原文。</p>'
              return `<article class="transcript-item">
                <h3>${escapePaperHtml(range)} · ${escapePaperHtml(material.title)}</h3>
                <div class="track">音频：${escapePaperHtml(material.audioExportName || '未关联音频')}</div>
                ${transcript}
              </article>`
            })
            .join('')}
        </section>`,
        )
        .join('')
    : '<section class="section"><header class="section-head"><h2>听力原文</h2></header><p class="empty">本试卷不包含听力材料。</p></section>'
  return pageShell(
    data,
    `${data.title} - 听力原文`,
    cover(data, 'LISTENING TRANSCRIPT') + sections,
  )
}
