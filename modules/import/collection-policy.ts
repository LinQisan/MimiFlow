import type { MaterialType } from '@prisma/client'

export function isCollectionTypeAllowedForMaterial(
  materialType: MaterialType,
  collectionType: string,
): boolean {
  if (materialType === 'LISTENING') return collectionType === 'PAPER'
  if (materialType === 'SPEAKING') return collectionType !== 'PAPER'
  if (materialType === 'MEDIA_SUBTITLE') return collectionType !== 'PAPER'
  return true
}

export function getMaterialCollectionTypeError(
  materialType: MaterialType,
  collectionType: string,
): string {
  if (isCollectionTypeAllowedForMaterial(materialType, collectionType)) return ''
  if (materialType === 'LISTENING') {
    return '听力材料目前只能加入正式试卷。练习书将在设置为听力内容来源后开放。'
  }
  if (materialType === 'SPEAKING') {
    return '跟读材料不能加入正式试卷集合，请选择普通集合或收藏夹。'
  }
  if (materialType === 'MEDIA_SUBTITLE') {
    return '影视字幕不能加入正式试卷集合，请选择普通集合或收藏夹。'
  }
  return '该集合类型不能承载当前材料。'
}
