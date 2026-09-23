import {
  exportVocabularyCsvAdmin,
  importVocabularyCsvAdmin,
} from '@/modules/knowledge/vocabulary/admin-actions'
import { getCurrentUser } from '@/modules/users/server/current-user'

export async function GET(request: Request) {
  if (!(await getCurrentUser()).isAdmin) return Response.json({ message: '没有管理权限。' }, { status: 403 })
  const wordbookId = new URL(request.url).searchParams.get('wordbook') || ''
  const result = await exportVocabularyCsvAdmin(wordbookId)
  if (!result.success) {
    return Response.json(result, { status: 404 })
  }
  const fileName = result.fileName.replace(/[\\/"]/g, '-')
  return new Response(result.csv, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="vocabulary.csv"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'X-Vocabulary-Count': String(result.count),
    },
  })
}

export async function POST(request: Request) {
  if (!(await getCurrentUser()).isAdmin) return Response.json({ message: '没有管理权限。' }, { status: 403 })
  const formData = await request.formData()
  const wordbookId = String(formData.get('wordbookId') || '')
  const file = formData.get('file')
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.csv')) {
    return Response.json({ success: false, message: '请选择 CSV 文件' }, { status: 400 })
  }
  if (file.size > 8_000_000) {
    return Response.json({ success: false, message: 'CSV 不能超过 8 MB' }, { status: 413 })
  }
  const result = await importVocabularyCsvAdmin(wordbookId, await file.text())
  return Response.json(result, { status: result.success ? 200 : 400 })
}
