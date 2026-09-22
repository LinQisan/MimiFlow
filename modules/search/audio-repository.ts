import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'

/** Search source materials independently of saved vocabulary. */
export async function searchAudioMaterials(tokens: string[]) {
  if (!tokens.length) return []
  // Prisma JSON filters cannot search properties inside PostgreSQL JSON arrays.
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT m.id FROM materials m
    CROSS JOIN LATERAL (
      SELECT concat_ws(' ', m.title,
        m.content_payload->>'description', m.content_payload->>'transcript',
        (SELECT string_agg(concat_ws(' ', line->>'text', line->>'note'), ' ')
         FROM jsonb_array_elements(CASE
           WHEN jsonb_typeof(m.content_payload->'dialogues') = 'array'
           THEN m.content_payload->'dialogues' ELSE '[]'::jsonb END) AS line)
      ) AS text
    ) searchable
    WHERE m.type IN ('LISTENING', 'SPEAKING')
      AND ${Prisma.join(tokens.map(token => Prisma.sql`strpos(lower(searchable.text), lower(${token})) > 0`), ' AND ')}
    ORDER BY m.created_at DESC, m.id
    LIMIT 20
  `)
  return prisma.material.findMany({
    where: { id: { in: rows.map(row => row.id) } },
    select: {
      id: true, title: true, type: true, contentPayload: true,
      collectionMaterials: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], take: 1,
        select: { collection: { select: { title: true } } },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  })
}
