import { access } from 'node:fs/promises'
import path from 'node:path'
import { chromium, type Browser } from 'playwright-core'

import type { PaperExportData } from './paper-export-data'
import {
  escapePaperHtml,
  renderAnswerPaperHtml,
  renderQuestionPaperHtml,
  renderTranscriptPaperHtml,
} from './paper-export-html'

const executableCandidates = () =>
  [
    process.env.CHROME_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    process.env.PROGRAMFILES
      ? path.join(
          process.env.PROGRAMFILES,
          'Google',
          'Chrome',
          'Application',
          'chrome.exe',
        )
      : null,
  ].filter((item): item is string => Boolean(item))

async function findChromeExecutable() {
  for (const candidate of executableCandidates()) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Try the next common installation location.
    }
  }
  throw new Error(
    '没有找到可用于生成 PDF 的 Chrome。请安装 Google Chrome，或设置 CHROME_EXECUTABLE_PATH。',
  )
}

async function htmlToPdf(browser: Browser, html: string, title: string) {
  const page = await browser.newPage({
    viewport: { width: 1240, height: 1754 },
  })
  try {
    await page.setContent(html, { waitUntil: 'load' })
    await page.emulateMedia({ media: 'print' })
    await page.evaluate(async () => {
      await document.fonts.ready
      await Promise.all(
        Array.from(document.images).map(image =>
          image.complete
            ? Promise.resolve()
            : image.decode().catch(() => undefined),
        ),
      )
    })
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      margin: {
        top: '15mm',
        right: '16mm',
        bottom: '16mm',
        left: '16mm',
      },
      headerTemplate: `<div style="width:100%;padding:0 16mm;font-family:Arial,sans-serif;font-size:7.5px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapePaperHtml(title)}</div>`,
      footerTemplate:
        '<div style="width:100%;padding:0 16mm;font-family:Arial,sans-serif;font-size:7.5px;color:#94a3b8;text-align:right"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    })
  } finally {
    await page.close()
  }
}

export async function generatePaperExportPdfs(data: PaperExportData) {
  const executablePath = await findChromeExecutable()
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--disable-dev-shm-usage', '--allow-file-access-from-files'],
  })
  try {
    const questionPdf = await htmlToPdf(
      browser,
      renderQuestionPaperHtml(data),
      `${data.title} · 试题`,
    )
    const answerPdf = await htmlToPdf(
      browser,
      renderAnswerPaperHtml(data),
      `${data.title} · 答案与解析`,
    )
    const transcriptPdf = await htmlToPdf(
      browser,
      renderTranscriptPaperHtml(data),
      `${data.title} · 听力原文`,
    )
    return { questionPdf, answerPdf, transcriptPdf }
  } finally {
    await browser.close()
  }
}
