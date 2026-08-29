import { buildReadingFrequencyMaterials } from '@/features/reading/server/word-frequency'

export async function GET() {
  return Response.json(await buildReadingFrequencyMaterials())
}
