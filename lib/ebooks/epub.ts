import JSZip from 'jszip'

type EpubManifestItem = {
  id: string
  href: string
  mediaType: string
}

type ParsedEpubChapter = {
  id: string
  title: string
  text: string
  href: string
}

export type ParsedEpub = {
  title: string
  author: string
  description: string
  language: string
  chapters: ParsedEpubChapter[]
  text: string
}

const XML_TEXT_DECODER = new TextDecoder('utf-8')

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )

const stripTags = (value: string) =>
  decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<rt\b[^>]*>[\s\S]*?<\/rt>/gi, '')
      .replace(/<rp\b[^>]*>[\s\S]*?<\/rp>/gi, '')
      .replace(/<rtc\b[^>]*>[\s\S]*?<\/rtc>/gi, '')
      .replace(/<\/(p|div|section|article|h[1-6]|li|blockquote|tr)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
  )

const getFirstTagText = (xml: string, tagName: string) => {
  const escaped = tagName.replace(':', '\\:')
  const direct = xml.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'))
  if (direct?.[1]) return stripTags(direct[1])
  const fallback = xml.match(new RegExp(`<[^>]*${escaped}[^>]*>([\\s\\S]*?)<\\/[^>]*${escaped}>`, 'i'))
  return fallback?.[1] ? stripTags(fallback[1]) : ''
}

const getAttribute = (tag: string, name: string) => {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'))
  return match?.[1] ? decodeHtmlEntities(match[1]) : ''
}

const dirname = (path: string) => {
  const normalized = path.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  return index >= 0 ? normalized.slice(0, index + 1) : ''
}

const resolvePath = (baseDir: string, href: string) => {
  const cleanHref = href.split('#')[0]
  const parts = `${baseDir}${cleanHref}`.split('/')
  const stack: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return stack.join('/')
}

const parseManifest = (opf: string) => {
  const items = new Map<string, EpubManifestItem>()
  for (const match of opf.matchAll(/<item\b[^>]*>/gi)) {
    const tag = match[0]
    const id = getAttribute(tag, 'id')
    const href = getAttribute(tag, 'href')
    const mediaType = getAttribute(tag, 'media-type')
    if (id && href) {
      items.set(id, { id, href, mediaType })
    }
  }
  return items
}

const parseSpineIds = (opf: string) =>
  Array.from(opf.matchAll(/<itemref\b[^>]*>/gi))
    .map(match => getAttribute(match[0], 'idref'))
    .filter(Boolean)

const extractChapterTitle = (html: string, fallback: string) => {
  const heading = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)
  if (heading?.[1]) return stripTags(heading[1]).slice(0, 80) || fallback
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return title?.[1] ? stripTags(title[1]).slice(0, 80) || fallback : fallback
}

export async function parseEpub(arrayBuffer: ArrayBuffer): Promise<ParsedEpub> {
  const zip = await JSZip.loadAsync(arrayBuffer)
  const containerFile = zip.file('META-INF/container.xml')
  if (!containerFile) {
    throw new Error('EPUB 缺少 META-INF/container.xml。')
  }

  const containerXml = await containerFile.async('string')
  const rootfileTag = containerXml.match(/<rootfile\b[^>]*>/i)?.[0] || ''
  const opfPath = getAttribute(rootfileTag, 'full-path')
  if (!opfPath) {
    throw new Error('EPUB 未声明 OPF 主文件。')
  }

  const opfFile = zip.file(opfPath)
  if (!opfFile) {
    throw new Error('EPUB 主文件不存在。')
  }

  const opf = XML_TEXT_DECODER.decode(await opfFile.async('uint8array'))
  const opfDir = dirname(opfPath)
  const manifest = parseManifest(opf)
  const spineIds = parseSpineIds(opf)
  const title = getFirstTagText(opf, 'dc:title') || '未命名电子书'
  const author = getFirstTagText(opf, 'dc:creator')
  const description = getFirstTagText(opf, 'dc:description')
  const language = getFirstTagText(opf, 'dc:language')

  const chapters: ParsedEpubChapter[] = []
  for (const id of spineIds) {
    const item = manifest.get(id)
    if (!item) continue
    if (
      item.mediaType &&
      !/xhtml|html|xml/i.test(item.mediaType)
    ) {
      continue
    }
    const chapterPath = resolvePath(opfDir, item.href)
    const chapterFile = zip.file(chapterPath)
    if (!chapterFile) continue
    const html = await chapterFile.async('string')
    const text = stripTags(html)
    if (!text) continue
    chapters.push({
      id: item.id,
      href: item.href,
      title: extractChapterTitle(html, `第 ${chapters.length + 1} 章`),
      text,
    })
  }

  if (chapters.length === 0) {
    throw new Error('未能从 EPUB 中解析出正文页面。')
  }

  return {
    title,
    author,
    description,
    language,
    chapters,
    text: chapters.map(chapter => chapter.text).join('\n\n'),
  }
}
