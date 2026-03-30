// app/admin/upload/page.tsx
import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import Link from 'next/link'
import UploadForm from './UploadForm'

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})
const prisma = new PrismaClient({ adapter })

export default async function AssUploadPage() {
  // 1. 查出大模块 (用于新建)
  const dbLevels = await prisma.level.findMany({
    select: { id: true, title: true },
  })

  // 2. 🌟 查出所有已有的试卷组，并带上它的父级名称 (用于快捷选择)
  const dbCategories = await prisma.category.findMany({
    select: {
      id: true,
      name: true,
      level: { select: { title: true } },
      lessons: {
        select: { lessonNum: true, title: true, audioFile: true },
        orderBy: { id: 'desc' }, // 把最新添加的排在第一个
        take: 1, // 我们只需要最新的一条数据用来做提示就够了
      },
    },
    orderBy: { id: 'desc' },
  })

  return (
    <div
      style={{
        maxWidth: '600px',
        margin: '50px auto',
        padding: '20px',
        fontFamily: 'sans-serif',
      }}>
      <div style={{ marginBottom: '20px' }}>
        <Link
          href='/admin/manage'
          style={{
            color: '#0070f3',
            textDecoration: 'none',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}>
          <svg
            className='w-4 h-4'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'
            style={{ width: '16px', height: '16px' }}>
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M10 19l-7-7m0 0l7-7m-7 7h18'
            />
          </svg>
          <span>返回管理中心</span>
        </Link>
      </div>

      <h1>🎬 上传新题目 (ASS字幕录入)</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        填写题目信息并上传 .ass 文件，系统将自动进行时间轴智能排版并存入数据库。
      </p>

      {/* 将两种数据都传给表单 */}
      <UploadForm levels={dbLevels} categories={dbCategories} />
    </div>
  )
}
