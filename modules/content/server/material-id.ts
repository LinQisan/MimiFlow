import 'server-only'

import { MaterialType } from '@prisma/client'
import prisma from '@/lib/prisma'

export async function resolveMaterialId(
  type: MaterialType | MaterialType[],
  id: string,
) {
  const material = await prisma.material.findFirst({
    where: { id, type: { in: Array.isArray(type) ? type : [type] } },
    select: { id: true },
  })
  return material?.id ?? null
}
