import { ZipArchive } from 'archiver'
import { PassThrough, Readable } from 'node:stream'

import { getPaperExportData } from '@/modules/practice/export/paper-export-data'
import { generatePaperExportPdfs } from '@/modules/practice/export/paper-export-pdf'
import { getCurrentUser } from '@/modules/users/server/current-user'

export const dynamic = 'force-dynamic'

const safeArchiveName = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 100) || '试卷'

const exportReadme = (
  data: NonNullable<Awaited<ReturnType<typeof getPaperExportData>>>,
) => {
  const lines = [
    data.title,
    '',
    '文件说明',
    '- 01-试题.pdf：无答案的原题，适合 A4 打印。',
    '- 02-答案与解析.pdf：答案速查、正确答案与已录入的解析。',
    '- 03-听力原文.pdf：按听力部分和音频文件整理的原文。',
    '- audios/：试卷关联的原始听力音频。',
    '',
    `题目数量：${data.questionCount}`,
    `音频数量：${data.audioFiles.length}`,
    `导出时间：${data.generatedAt.toLocaleString('zh-CN', { timeZone: 'Asia/Tokyo' })}`,
  ]
  if (data.warnings.length) {
    lines.push('', '导出警告', ...data.warnings.map(item => `- ${item}`))
  }
  return lines.join('\n')
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getCurrentUser()).isAdmin) return Response.json({ message: '没有管理权限。' }, { status: 403 })
  const { id } = await params
  const data = await getPaperExportData(id)
  if (!data) {
    return Response.json(
      { message: '试卷不存在或已被删除。' },
      { status: 404 },
    )
  }

  try {
    const pdfs = await generatePaperExportPdfs(data)
    const archive = new ZipArchive({ zlib: { level: 6 } })
    const output = new PassThrough()
    archive.on('error', (error: Error) => output.destroy(error))
    archive.pipe(output)

    archive.append(pdfs.questionPdf, { name: '01-试题.pdf' })
    archive.append(pdfs.answerPdf, { name: '02-答案与解析.pdf' })
    archive.append(pdfs.transcriptPdf, { name: '03-听力原文.pdf' })
    for (const audio of data.audioFiles) {
      archive.file(audio.absolutePath, { name: `audios/${audio.exportName}` })
    }
    archive.append(exportReadme(data), { name: '导出说明.txt' })
    void archive.finalize()

    const archiveName = `${safeArchiveName(data.title)}-导出.zip`
    return new Response(Readable.toWeb(output) as ReadableStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="paper-export.zip"; filename*=UTF-8''${encodeURIComponent(archiveName)}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Paper export failed', error)
    return Response.json(
      {
        message:
          error instanceof Error ? error.message : '生成试卷压缩包失败。',
      },
      { status: 500 },
    )
  }
}
