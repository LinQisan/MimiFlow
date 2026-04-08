// app/admin/upload/page.tsx
import UploadCenterUI from './UploadCenterUI'
import { getUploadPageSeedData } from '@/lib/repositories/manage.repo'

export default async function UnifiedUploadPage() {
  const { dbLevels, dbCollections } = await getUploadPageSeedData()

  return (
    // 将数据喂给客户端 UI 组件
    <UploadCenterUI dbLevels={dbLevels} dbCollections={dbCollections} />
  )
}
