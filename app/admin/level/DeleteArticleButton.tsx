'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { deleteArticle } from '@/app/actions/content'
import { useDialog } from '@/context/DialogContext'

export default function DeleteArticleButton({
  articleId,
  title,
}: {
  articleId: string
  title: string
}) {
  const dialog = useDialog()
  const [isDeleting, setIsDeleting] = useState(false)

  // 🌟 新增：控制轻量级气泡弹窗的状态
  const [showConfirm, setShowConfirm] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // 🌟 新增：点击弹窗外部区域，自动关闭弹窗
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowConfirm(false)
      }
    }
    if (showConfirm) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showConfirm])

  const handleConfirmDelete = async () => {
    setIsDeleting(true)
    setShowConfirm(false) // 点击确认后立刻收起气泡

    try {
      const res = await deleteArticle(articleId)
      if (res.success) {
        router.refresh() // 刷新当前页面数据
      } else {
        await dialog.alert(res.message || '删除失败，请检查是否有关联数据')
        setIsDeleting(false)
      }
    } catch (error) {
      await dialog.alert('网络或服务器错误，删除失败')
      setIsDeleting(false)
    }
  }

  return (
    <div className='relative inline-block' ref={menuRef}>
      {/* 触发按钮 */}
      <button
        onClick={() => setShowConfirm(!showConfirm)}
        disabled={isDeleting}
        className={`text-xs px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 font-bold ${
          showConfirm
            ? 'bg-red-100 text-red-700'
            : 'bg-red-50 text-red-600 hover:bg-red-100'
        }`}>
        {isDeleting ? '删除中...' : '🗑️ 删除'}
      </button>

      {/* 🌟 优雅的轻量级确认气泡 */}
      {showConfirm && !isDeleting && (
        <div className='absolute right-0 bottom-full mb-2 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 p-3 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200'>
          <p className='text-xs text-gray-600 mb-3 font-medium leading-relaxed'>
            确定要删除{' '}
            <span className='font-bold text-red-500 line-clamp-1' title={title}>
              《{title}》
            </span>{' '}
            吗？此操作不可恢复。
          </p>
          <div className='flex gap-2'>
            <button
              onClick={() => setShowConfirm(false)}
              className='flex-1 text-xs px-2 py-2 bg-gray-50 text-gray-600 rounded-xl hover:bg-gray-100 hover:text-gray-900 transition-colors font-bold'>
              取消
            </button>
            <button
              onClick={handleConfirmDelete}
              className='flex-1 text-xs px-2 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors font-bold shadow-md shadow-red-200'>
              确定删除
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
