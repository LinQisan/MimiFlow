import { MaterialType } from '@prisma/client'
import prisma from '@/lib/prisma'
import { decodeMaterialPayload } from '@/lib/codecs/material-payload'
import { listeningMaterialId, matchListeningSentenceSource } from '../domain/listening-source'

/** Recover source references in one material query; callers supply user-owned examples. */
export async function resolveListeningSentenceReferences(examples: Array<{ text: string; sourceUrl: string }>) {
  const ids = [...new Set(examples.map(row => listeningMaterialId(row.sourceUrl)).filter(Boolean))]
  const result = new Map<string, string>()
  if (!ids.length) return result
  const materials = await prisma.material.findMany({
    where: { id: { in: ids }, type: MaterialType.LISTENING },
    select: { id: true, contentPayload: true },
  })
  const byId = new Map(materials.map(row => [row.id, decodeMaterialPayload(MaterialType.LISTENING, row.contentPayload)]))
  for (const example of examples) {
    const id = listeningMaterialId(example.sourceUrl)
    const payload = byId.get(id)
    if (!payload || !payload.audioFile) continue
    const sourceId = matchListeningSentenceSource(example.text, id, payload.dialogues)
    if (sourceId) result.set(JSON.stringify([example.sourceUrl, example.text]), sourceId)
  }
  return result
}
