import { spawn } from 'node:child_process'
import { cpus, freemem, platform, release, totalmem } from 'node:os'
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { performance } from 'node:perf_hooks'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'
import { chromium } from 'playwright-core'

import {
  annotateJapaneseTextWithSudachi,
  buildJapaneseRubyHtml,
} from '../utils/language/japaneseRuby.ts'

const ROOT = process.cwd()
const OUTPUT_DIR = path.join(ROOT, 'performance')
const RUNS = Math.max(1, Number(process.env.PERF_RUNS || 3))
const SHOULD_BUILD = !process.argv.includes('--skip-build')
const ROUTES = ['/', '/listening', '/reading', '/practice', '/vocabulary']
const BASE_LONG_LIST_ROUTES = ['/listening', '/practice', '/vocabulary', '/manage/vocabulary']
const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.wav', '.aac', '.ogg', '.flac'])

dotenv.config({ path: ['.env.local', '.env'], quiet: true })

const round = value => Math.round(value * 10) / 10
const bytesToMiB = value => round(value / 1024 / 1024)
const percentile = (values, ratio) => {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  return round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))])
}
const summarize = values => ({
  minMs: percentile(values, 0),
  medianMs: percentile(values, 0.5),
  p95Ms: percentile(values, 0.95),
  maxMs: percentile(values, 1),
})

const runCommand = (command, args) =>
  new Promise((resolve, reject) => {
    const startedAt = performance.now()
    const child = spawn(command, args, {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', chunk => {
      output += chunk.toString()
      process.stdout.write(chunk)
    })
    child.stderr.on('data', chunk => {
      output += chunk.toString()
      process.stderr.write(chunk)
    })
    child.on('error', reject)
    child.on('exit', code => {
      if (code !== 0) {
        reject(new Error(`${command} ${args.join(' ')} exited with ${code}`))
        return
      }
      resolve({ durationMs: round(performance.now() - startedAt), output })
    })
  })

const getFreePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })

const waitForHttp = async (url, timeoutMs = 30_000) => {
  const startedAt = performance.now()
  let lastError
  while (performance.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: 'manual' })
      if (response.status < 500) return round(performance.now() - startedAt)
    } catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error(`Application did not become ready: ${lastError || 'timeout'}`)
}

const startApplication = async port => {
  const startedAt = performance.now()
  const child = spawn('npm', ['run', 'start', '--', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let readyLogMs = null
  let logs = ''
  const collect = chunk => {
    const text = chunk.toString()
    logs += text
    if (readyLogMs == null && /Ready in/.test(text)) {
      readyLogMs = round(performance.now() - startedAt)
    }
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  const httpReadyMs = await waitForHttp(`http://127.0.0.1:${port}/`)
  return {
    child,
    result: { readyLogMs, httpReadyMs, pid: child.pid },
    logs: () => logs,
  }
}

const stopApplication = child =>
  new Promise(resolve => {
    if (child.exitCode != null) return resolve()
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
    }, 3_000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill('SIGTERM')
  })

const resolveBrowserPath = async () => {
  const candidates = [
    process.env.PERF_BROWSER_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      await stat(candidate)
      return candidate
    } catch {}
  }
  throw new Error('No Chrome/Chromium executable found. Set PERF_BROWSER_PATH.')
}

const collectDataset = async () => {
  if (!process.env.DATABASE_URL) return { error: 'DATABASE_URL is not configured' }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  })
  try {
    const [
      materials,
      questions,
      vocabularies,
      subtitleLines,
      attempts,
      audioMaterials,
      subtitleGroups,
    ] = await Promise.all([
        prisma.material.count(),
        prisma.question.count(),
        prisma.vocabulary.count(),
        prisma.mediaSubtitleLine.count(),
        prisma.questionAttempt.count(),
        prisma.material.count({
          where: {
            contentPayload: { path: ['audioFile'], not: '' },
          },
        }),
        prisma.mediaSubtitleLine.groupBy({
          by: ['materialId'],
          _count: { _all: true },
          orderBy: { _count: { materialId: 'desc' } },
          take: 1,
        }),
      ])
    const largestSubtitle = subtitleGroups[0]
      ? {
          materialId: subtitleGroups[0].materialId,
          lines: subtitleGroups[0]._count._all,
        }
      : null
    return {
      materials,
      questions,
      vocabularies,
      subtitleLines,
      attempts,
      audioMaterials,
      largestSubtitle,
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  } finally {
    await prisma.$disconnect()
  }
}

const findFirstAudio = async directory => {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      const nested = await findFirstAudio(absolutePath)
      if (nested) return nested
    } else if (AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      const details = await stat(absolutePath)
      return {
        absolutePath,
        webPath: `/${path
          .relative(path.join(ROOT, 'public'), absolutePath)
          .split(path.sep)
          .map(segment => encodeURIComponent(segment))
          .join('/')}`,
        sizeBytes: details.size,
      }
    }
  }
  return null
}

const waitForSettledFrame = page =>
  page.evaluate(
    () =>
      new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )

const measureHardLoads = async (browser, baseUrl) => {
  const results = {}
  for (const route of ROUTES) {
    const samples = []
    for (let run = 0; run < RUNS; run += 1) {
      const context = await browser.newContext()
      const page = await context.newPage()
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'load', timeout: 30_000 })
      await waitForSettledFrame(page)
      samples.push(
        await page.evaluate(() => {
          const navigation = performance.getEntriesByType('navigation')[0]
          const paint = Object.fromEntries(
            performance.getEntriesByType('paint').map(entry => [entry.name, entry.startTime]),
          )
          return {
            ttfbMs: navigation.responseStart,
            domContentLoadedMs: navigation.domContentLoadedEventEnd,
            loadMs: navigation.loadEventEnd,
            firstPaintMs: paint['first-paint'] || null,
            firstContentfulPaintMs: paint['first-contentful-paint'] || null,
            transferBytes: performance
              .getEntriesByType('resource')
              .reduce((sum, entry) => sum + (entry.transferSize || 0), navigation.transferSize || 0),
            domNodes: document.querySelectorAll('*').length,
          }
        }),
      )
      await context.close()
    }
    results[route] = {
      runs: samples,
      ttfb: summarize(samples.map(item => item.ttfbMs)),
      contentLoaded: summarize(samples.map(item => item.domContentLoadedMs)),
      load: summarize(samples.map(item => item.loadMs)),
      fcp: summarize(samples.map(item => item.firstContentfulPaintMs).filter(Number.isFinite)),
      medianTransferKiB: round(percentile(samples.map(item => item.transferBytes), 0.5) / 1024),
      medianDomNodes: percentile(samples.map(item => item.domNodes), 0.5),
    }
  }
  return results
}

const measureClientNavigation = async (browser, baseUrl) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const results = {}
  for (const route of ROUTES.filter(item => item !== '/')) {
    const samples = []
    for (let run = 0; run < RUNS; run += 1) {
      await page.goto(`${baseUrl}/`, { waitUntil: 'load', timeout: 30_000 })
      await waitForSettledFrame(page)
      const startedAt = await page.evaluate(() => performance.now())
      await Promise.all([
        page.waitForURL(`${baseUrl}${route}`, { timeout: 30_000 }),
        page.locator(`a[href="${route}"]`).first().click(),
      ])
      await waitForSettledFrame(page)
      samples.push(round((await page.evaluate(() => performance.now())) - startedAt))
    }
    results[route] = { runsMs: samples, ...summarize(samples) }
  }
  await context.close()
  return results
}

const measureLongLists = async (browser, baseUrl, routes) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const results = {}
  for (const route of routes) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'load', timeout: 30_000 })
    await waitForSettledFrame(page)
    results[route] = await page.evaluate(async () => {
      const frameDeltas = []
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight)
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      let previous = performance.now()
      for (let frame = 0; frame < 90; frame += 1) {
        await new Promise(resolve => requestAnimationFrame(resolve))
        const now = performance.now()
        frameDeltas.push(now - previous)
        previous = now
        if (maxScroll > 0) scrollTo(0, (maxScroll * frame) / 89)
      }
      scrollTo(0, 0)
      const sorted = [...frameDeltas].sort((left, right) => left - right)
      const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
      return {
        domNodes: document.querySelectorAll('*').length,
        rowLikeNodes: document.querySelectorAll('tr, article, [role="row"], li').length,
        scrollHeight: document.documentElement.scrollHeight,
        maxScroll,
        averageFrameMs: frameDeltas.reduce((sum, value) => sum + value, 0) / frameDeltas.length,
        p95FrameMs: p95,
        framesOver20Ms: frameDeltas.filter(value => value > 20).length,
        framesOver50Ms: frameDeltas.filter(value => value > 50).length,
      }
    })
    Object.entries(results[route]).forEach(([key, value]) => {
      if (typeof value === 'number') results[route][key] = round(value)
    })
  }
  await context.close()
  return results
}

const measureRuby = () => {
  const lexemes = [
    ['１０万', 'いちれいまん'],
    ['人', 'にん'],
    ['日本語', 'にほんご'],
    ['勉強', 'べんきょう'],
    ['辿（たど）っ', 'たどっ'],
    ['考え', 'かんがえ'],
  ]
  const lexicon = Object.fromEntries(
    lexemes.map(([surface, reading]) => [
      surface,
      {
        surface,
        dictionaryForm: surface,
        normalizedForm: surface,
        reading,
        dictionaryReading: reading,
        partsOfSpeech: ['名詞'],
      },
    ]),
  )
  const sentence = '１０万人が日本語を勉強し、道を辿（たど）って考えている。'
  const text = Array.from({ length: 300 }, () => sentence).join('\n')
  const samples = []
  annotateJapaneseTextWithSudachi(text, lexicon, {
    useSudachiReading: true,
    rubyEnabled: true,
  })
  for (let run = 0; run < 30; run += 1) {
    const startedAt = performance.now()
    annotateJapaneseTextWithSudachi(text, lexicon, {
      useSudachiReading: true,
      rubyEnabled: true,
    })
    samples.push(performance.now() - startedAt)
  }
  const tokenSamples = []
  const tokenBatchSize = 500
  for (let batch = 0; batch < 50; batch += 1) {
    const startedAt = performance.now()
    for (let run = 0; run < tokenBatchSize; run += 1) {
      buildJapaneseRubyHtml('辿（たど）っ', 'たどっ', { groupKanji: true })
    }
    tokenSamples.push(((performance.now() - startedAt) * 1_000) / tokenBatchSize)
  }
  return {
    textCharacters: text.length,
    document: { runsMs: samples.map(round), ...summarize(samples) },
    singleToken: {
      iterations: tokenSamples.length * tokenBatchSize,
      medianUs: percentile(tokenSamples, 0.5),
      p95Us: percentile(tokenSamples, 0.95),
    },
  }
}

const measureAudio = async (browser, baseUrl, audio) => {
  if (!audio) return { available: false }
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`${baseUrl}/`, { waitUntil: 'load', timeout: 30_000 })
  const result = await page.evaluate(async source => {
    performance.clearResourceTimings()
    const rangeStartedAt = performance.now()
    const response = await fetch(source, { headers: { Range: 'bytes=0-262143' } })
    const payload = await response.arrayBuffer()
    const rangeMs = performance.now() - rangeStartedAt
    const metadataStartedAt = performance.now()
    const metadata = await new Promise(resolve => {
      const audioElement = new Audio()
      const timeout = setTimeout(() => resolve({ error: 'timeout' }), 10_000)
      audioElement.preload = 'metadata'
      audioElement.onloadedmetadata = () => {
        clearTimeout(timeout)
        resolve({ durationSeconds: audioElement.duration })
      }
      audioElement.onerror = () => {
        clearTimeout(timeout)
        resolve({ error: 'media error' })
      }
      audioElement.src = source
    })
    const resource = performance
      .getEntriesByType('resource')
      .filter(entry => entry.name.endsWith(source))
      .at(-1)
    return {
      status: response.status,
      acceptRanges: response.headers.get('accept-ranges'),
      contentRange: response.headers.get('content-range'),
      bytesRead: payload.byteLength,
      rangeMs,
      metadataMs: performance.now() - metadataStartedAt,
      metadata,
      resource: resource?.toJSON?.() || null,
    }
  }, audio.webPath)
  await context.close()
  return {
    available: true,
    webPath: audio.webPath,
    fileSizeMiB: bytesToMiB(audio.sizeBytes),
    ...result,
    rangeMs: round(result.rangeMs),
    metadataMs: round(result.metadataMs),
  }
}

const readProcessRss = pid =>
  new Promise(resolve => {
    const child = spawn('ps', ['-o', 'rss=', '-p', String(pid)], { stdio: ['ignore', 'pipe', 'ignore'] })
    let output = ''
    child.stdout.on('data', chunk => {
      output += chunk.toString()
    })
    child.on('exit', () => resolve(bytesToMiB((Number(output.trim()) || 0) * 1024)))
  })

const renderMarkdown = report => {
  const hardLoadRows = Object.entries(report.hardLoads)
    .map(
      ([route, value]) =>
        `| ${route} | ${value.ttfb.medianMs} | ${value.fcp.medianMs ?? '—'} | ${value.load.medianMs} | ${value.medianTransferKiB} | ${value.medianDomNodes} |`,
    )
    .join('\n')
  const navigationRows = Object.entries(report.clientNavigation)
    .map(([route, value]) => `| ${route} | ${value.medianMs} | ${value.p95Ms} |`)
    .join('\n')
  const listRows = Object.entries(report.longLists)
    .map(
      ([route, value]) =>
        `| ${route} | ${value.domNodes} | ${value.rowLikeNodes} | ${value.scrollHeight} | ${value.averageFrameMs} | ${value.p95FrameMs} | ${value.framesOver20Ms} |`,
    )
    .join('\n')
  const buildSummary = report.build
    ? `${report.build.durationMs} ms`
    : '复用现有构建'
  const audioSummary = report.audio.available
    ? `- 文件：${decodeURIComponent(report.audio.webPath)}（${report.audio.fileSizeMiB} MiB）\n- Range 请求：HTTP ${report.audio.status}，读取 ${report.audio.bytesRead} bytes，用时 ${report.audio.rangeMs} ms\n- metadata 就绪：${report.audio.metadataMs} ms，时长 ${round(report.audio.metadata?.durationSeconds || 0)} 秒`
    : '- 没有找到可测音频文件'

  return `# MimiFlow 性能基线\n\n生成时间：${report.generatedAt}\n\n## 环境与数据\n\n- Node：${report.system.node}\n- 系统：${report.system.platform} ${report.system.arch} ${report.system.release}\n- CPU：${report.system.cpu}\n- 数据：${JSON.stringify(report.dataset)}\n- 构建：${buildSummary}\n- 服务冷启动：日志就绪 ${report.startup.readyLogMs} ms，首页 HTTP 可用 ${report.startup.httpReadyMs} ms\n- 服务进程 RSS：${report.startup.serverRssMiB} MiB\n\n## 页面硬加载（${RUNS} 次，中位数）\n\n| 页面 | TTFB ms | FCP ms | Load ms | 传输 KiB | DOM 节点 |\n|---|---:|---:|---:|---:|---:|\n${hardLoadRows}\n\n## 客户端页面切换\n\n| 目标页面 | 中位数 ms | P95 ms |\n|---|---:|---:|\n${navigationRows}\n\n## 长列表滚动\n\n| 页面 | DOM 节点 | 行类节点 | 页面高度 | 平均帧 ms | P95 帧 ms | >20ms 帧 |\n|---|---:|---:|---:|---:|---:|---:|\n${listRows}\n\n## 注音\n\n- 文本长度：${report.ruby.textCharacters} 字符\n- 整篇注音：中位数 ${report.ruby.document.medianMs} ms，P95 ${report.ruby.document.p95Ms} ms\n- 单词注音：中位数 ${report.ruby.singleToken.medianUs} μs，P95 ${report.ruby.singleToken.p95Us} μs\n\n## 音频\n\n${audioSummary}\n`
}

let application
let browser
try {
  const build = SHOULD_BUILD ? await runCommand('npm', ['run', 'build']) : null
  const dataset = await collectDataset()
  const longListRoutes = [
    ...BASE_LONG_LIST_ROUTES,
    ...(dataset.largestSubtitle
      ? [`/subtitles/${encodeURIComponent(dataset.largestSubtitle.materialId)}`]
      : []),
  ]
  const audioFile = await findFirstAudio(path.join(ROOT, 'public', 'audios'))
  const port = await getFreePort()
  application = await startApplication(port)
  const baseUrl = `http://127.0.0.1:${port}`
  browser = await chromium.launch({
    headless: true,
    executablePath: await resolveBrowserPath(),
  })
  const hardLoads = await measureHardLoads(browser, baseUrl)
  const clientNavigation = await measureClientNavigation(browser, baseUrl)
  const longLists = await measureLongLists(browser, baseUrl, longListRoutes)
  const ruby = measureRuby()
  const audio = await measureAudio(browser, baseUrl, audioFile)
  const serverRssMiB = await readProcessRss(application.result.pid)
  const report = {
    generatedAt: new Date().toISOString(),
    system: {
      node: process.version,
      platform: platform(),
      arch: process.arch,
      release: release(),
      cpu: cpus()[0]?.model || 'unknown',
      cpuCount: cpus().length,
      totalMemoryMiB: bytesToMiB(totalmem()),
      freeMemoryMiB: bytesToMiB(freemem()),
    },
    configuration: { runs: RUNS, routes: ROUTES, longListRoutes },
    dataset,
    build,
    startup: { ...application.result, serverRssMiB },
    hardLoads,
    clientNavigation,
    longLists,
    ruby,
    audio,
  }
  await mkdir(OUTPUT_DIR, { recursive: true })
  await Promise.all([
    writeFile(path.join(OUTPUT_DIR, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`),
    writeFile(path.join(OUTPUT_DIR, 'latest.md'), renderMarkdown(report)),
  ])
  console.log(`\nPerformance report: ${path.join(OUTPUT_DIR, 'latest.md')}`)
} catch (error) {
  console.error(error)
  if (application) console.error(application.logs())
  process.exitCode = 1
} finally {
  await browser?.close().catch(() => {})
  if (application) await stopApplication(application.child)
}
