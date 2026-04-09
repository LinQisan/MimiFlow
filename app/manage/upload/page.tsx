// app/admin/upload/page.tsx
import Link from 'next/link'
import UploadCenterUI from './UploadCenterUI'
import { getUploadPageSeedData } from '@/lib/repositories/manage.repo'

export default async function UnifiedUploadPage() {
  const { dbLevels, dbCollections } = await getUploadPageSeedData()

  return (
    <>
      <div className='mx-auto max-w-7xl px-3 pt-4 md:px-6 md:pt-6'>
        <Link
          href='/manage'
          className='inline-flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-700'>
          返回管理中心
        </Link>
      </div>
      <UploadCenterUI dbLevels={dbLevels} dbCollections={dbCollections} />
    </>
  )
}
