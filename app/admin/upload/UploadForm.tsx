'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { uploadAssAndSaveData } from './action'
import { useDialog } from '@/context/DialogContext'

// ==========================================
// 🌟 核心：手写的高级自定义下拉菜单组件
// ==========================================
function CustomDropdown({
  value,
  onChange,
  options,
  placeholder,
  icon,
}: {
  value: string
  onChange: (val: string) => void
  options: { value: string; label: string }[]
  placeholder: string
  icon?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 点击外部自动关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedLabel =
    options.find(o => o.value === value)?.label || placeholder

  return (
    <div className='relative w-full' ref={ref}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full p-4 bg-gray-50 border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-400 outline-none transition-all cursor-pointer flex justify-between items-center
          ${isOpen ? 'border-indigo-400 ring-2 ring-indigo-400/20 bg-white' : 'border-gray-200 hover:bg-white'}
        `}>
        <span
          className={value ? 'text-gray-800 truncate pr-4' : 'text-gray-400'}>
          {icon && <span className='mr-2'>{icon}</span>}
          {selectedLabel}
        </span>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform duration-300 shrink-0 ${isOpen ? 'rotate-180 text-indigo-500' : ''}`}
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'>
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2.5}
            d='M19 9l-7 7-7-7'
          />
        </svg>
      </div>

      {isOpen && (
        <div className='absolute z-50 w-full mt-2 bg-white border border-gray-100 rounded-2xl shadow-xl max-h-64 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-2 py-2'>
          {options.length === 0 ? (
            <div className='px-4 py-3 text-sm text-gray-400 text-center'>
              暂无选项
            </div>
          ) : (
            options.map(opt => (
              <div
                key={opt.value}
                onClick={() => {
                  onChange(opt.value)
                  setIsOpen(false)
                }}
                className={`px-4 py-3 text-sm font-bold cursor-pointer transition-colors truncate
                  ${value === opt.value ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50 hover:text-indigo-600'}
                `}>
                {opt.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

type Props = {
  levels: { id: string; title: string }[]
  categories: {
    id: string
    name: string
    level: { title: string }
    lessons: {
      lessonNum: string
      title: string
      audioFile: string
    }[]
  }[]
}

const autoIncrementString = (str: string) => {
  if (!str) return ''
  return str.replace(/(\d+)(?!.*\d)/, match => {
    const num = parseInt(match, 10) + 1
    return num.toString().padStart(match.length, '0')
  })
}

export default function UploadForm({ levels, categories }: Props) {
  const dialog = useDialog()
  const router = useRouter()

  const [mode, setMode] = useState<'existing' | 'new'>(
    categories.length > 0 ? 'existing' : 'new',
  )
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [selectedLevelId, setSelectedLevelId] = useState('') // 🌟 新增：记录大专区的选择

  const [status, setStatus] = useState<{
    type: 'idle' | 'loading' | 'success' | 'error'
    message: string
  }>({ type: 'idle', message: '' })

  const [lessonNum, setLessonNum] = useState('')
  const [title, setTitle] = useState('')
  const [audioFile, setAudioFile] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [description, setDescription] = useState('')

  const [isDragging, setIsDragging] = useState(false)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mode === 'existing' && selectedCategoryId) {
      const targetCategory = categories.find(c => c.id === selectedCategoryId)
      if (targetCategory && targetCategory.lessons.length > 0) {
        const latest = targetCategory.lessons[0]
        setLessonNum(autoIncrementString(latest.lessonNum))
        setTitle(autoIncrementString(latest.title))
        setAudioFile(autoIncrementString(latest.audioFile))
      } else {
        setLessonNum('1')
        setTitle('')
        setAudioFile('/audios/')
      }
    }
  }, [mode, selectedCategoryId, categories])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    // 🌟 手动拦截：因为我们把原生的 select 换成了自定义组件（隐藏的 input 不会自动触发浏览器的必填提示）
    if (mode === 'existing' && !selectedCategoryId) {
      setStatus({ type: 'error', message: '❌ 请选择要添加内容的试卷包！' })
      return
    }
    if (mode === 'new' && !selectedLevelId) {
      setStatus({ type: 'error', message: '❌ 请选择所属的大专区！' })
      return
    }
    if (!fileInputRef.current?.files?.length) {
      setStatus({ type: 'error', message: '❌ 请先选择或拖拽上传 .ass 文件！' })
      return
    }

    setStatus({ type: 'loading', message: '🚀 正在解析并写入...' })
    const formData = new FormData(event.currentTarget)

    const result = await uploadAssAndSaveData(formData)

    setStatus({
      type: result.success ? 'success' : 'error',
      message: result.message,
    })

    if (result.success) {
      setSelectedFileName(null)
      if (mode === 'new') {
        setCategoryName('')
        setDescription('')
      }
      router.refresh()
    }
  }

  // ================= 拖拽逻辑 =================
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      const droppedFile = files[0]
      if (!droppedFile.name.endsWith('.ass')) {
        void dialog.alert('只能上传 .ass 格式的字幕文件。')
        return
      }
      setSelectedFileName(droppedFile.name)
      if (fileInputRef.current) {
        const dataTransfer = new DataTransfer()
        dataTransfer.items.add(droppedFile)
        fileInputRef.current.files = dataTransfer.files
      }
    }
  }
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFileName(
      e.target.files && e.target.files.length > 0
        ? e.target.files[0].name
        : null,
    )
  }
  const handleZoneClick = () => fileInputRef.current?.click()

  // 构建下拉菜单的数据选项
  const categoryOptions = categories.map(c => ({
    value: c.id,
    label: `[${c.level.title}] ${c.name}`,
  }))
  const levelOptions = levels.map(l => ({ value: l.id, label: l.title }))

  return (
    <form
      onSubmit={handleSubmit}
      className='flex flex-col gap-6 w-full max-w-4xl mx-auto pb-20 animate-in fade-in'>
      <input type='hidden' name='uploadMode' value={mode} />

      {/* ================= 1. 分类归属 ================= */}
      <fieldset className='bg-white p-6 md:p-8 rounded-[32px] shadow-sm border border-gray-100 relative overflow-visible'>
        <div className='absolute top-0 left-0 w-2 h-full bg-indigo-500 rounded-l-3xl'></div>
        <legend className='text-xl font-black text-gray-800 mb-6 px-4 tracking-wide flex items-center gap-2'>
          <span>📁</span> 分类归属 (Category)
        </legend>

        <div className='flex flex-wrap gap-4 mb-6 bg-gray-50/80 p-2.5 rounded-2xl border border-gray-100/50'>
          <label
            className={`flex-1 cursor-pointer flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold transition-all ${mode === 'existing' ? 'bg-white text-indigo-600 shadow-sm border border-gray-200/50' : 'text-gray-500 hover:bg-gray-100'} ${categories.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <input
              type='radio'
              className='hidden'
              checked={mode === 'existing'}
              onChange={() => setMode('existing')}
              disabled={categories.length === 0}
            />
            添加到已有试卷/单元组
          </label>
          <label
            className={`flex-1 cursor-pointer flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold transition-all ${mode === 'new' ? 'bg-white text-indigo-600 shadow-sm border border-gray-200/50' : 'text-gray-500 hover:bg-gray-100'}`}>
            <input
              type='radio'
              className='hidden'
              checked={mode === 'new'}
              onChange={() => setMode('new')}
            />
            创建全新的试卷包
          </label>
        </div>

        {mode === 'existing' ? (
          <div>
            {/* 🌟 使用自定义下拉菜单 */}
            <input type='hidden' name='categoryId' value={selectedCategoryId} />
            <CustomDropdown
              options={categoryOptions}
              value={selectedCategoryId}
              onChange={setSelectedCategoryId}
              placeholder='👇 请选择要将内容添加到哪个试卷包'
              icon='📂'
            />
          </div>
        ) : (
          <div className='flex flex-col gap-5'>
            <input
              type='hidden'
              name='categoryId'
              value={`auto_${Date.now()}`}
            />

            <div className='flex flex-col md:flex-row gap-5 z-20'>
              <input
                required
                name='categoryName'
                value={categoryName}
                onChange={e => setCategoryName(e.target.value)}
                placeholder='试卷包名称 (例: N1听力 2023年7月)'
                className='flex-[2] p-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-400 outline-none transition-all'
              />

              {/* 🌟 使用自定义下拉菜单 */}
              <div className='flex-[1]'>
                <input type='hidden' name='level' value={selectedLevelId} />
                <CustomDropdown
                  options={levelOptions}
                  value={selectedLevelId}
                  onChange={setSelectedLevelId}
                  placeholder='- 选择大专区 -'
                  icon='🏷️'
                />
              </div>
            </div>
            <textarea
              name='description'
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder='试卷包简介描述 (选填)'
              className='w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-400 outline-none transition-all min-h-[100px] resize-y custom-scrollbar'
            />
          </div>
        )}
      </fieldset>

      {/* ================= 2. 题目信息 (带智能预填) ================= */}
      <fieldset className='bg-white p-6 md:p-8 rounded-[32px] shadow-sm border border-gray-100 relative overflow-hidden'>
        <div className='absolute top-0 left-0 w-2 h-full bg-emerald-400 rounded-l-3xl'></div>
        <div className='flex justify-between items-center mb-6 px-4'>
          <legend className='text-xl font-black text-gray-800 tracking-wide flex items-center gap-2'>
            <span>🎧</span> 语料基础信息 (Lesson)
          </legend>
          {mode === 'existing' && selectedCategoryId && (
            <span className='text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 flex items-center gap-1.5'>
              <span className='animate-pulse'>✨</span> 已根据上集开启智能填充
            </span>
          )}
        </div>

        <div className='flex flex-col md:flex-row gap-5 mb-5 pl-2'>
          <div className='w-full md:w-1/3 relative'>
            <label className='text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5 block'>
              序号 (可不填/自动顺延)
            </label>
            {/* 🌟 核心修改：去掉了 required 属性，序号变为彻底选填 */}
            <input
              name='lessonNum'
              value={lessonNum}
              onChange={e => setLessonNum(e.target.value)}
              placeholder='例: 1.1'
              className='w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold text-gray-800 focus:ring-2 focus:ring-emerald-400 outline-none transition-all'
            />
          </div>
          <div className='w-full md:w-2/3'>
            <label className='text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5 block'>
              题目标题
            </label>
            <input
              required
              name='title'
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder='例: 問題1-01'
              className='w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold text-gray-800 focus:ring-2 focus:ring-emerald-400 outline-none transition-all'
            />
          </div>
        </div>

        <div className='pl-2'>
          <label className='text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5 block'>
            绑定的音频路径
          </label>
          <input
            required
            name='audioFile'
            value={audioFile}
            onChange={e => setAudioFile(e.target.value)}
            placeholder='例: /audios/N2-01.mp3'
            className='w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold text-gray-800 focus:ring-2 focus:ring-emerald-400 outline-none transition-all'
          />
        </div>
      </fieldset>

      {/* ================= 3. 拖拽上传区 ================= */}
      <div
        onClick={handleZoneClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative overflow-hidden flex flex-col items-center justify-center p-14 rounded-[32px] border-2 transition-all cursor-pointer 
          ${isDragging ? 'border-indigo-400 bg-indigo-50/80 scale-[1.02]' : selectedFileName ? 'border-emerald-400 bg-emerald-50/80' : 'border-dashed border-gray-300 bg-white hover:bg-gray-50 hover:border-indigo-300'}`}>
        <input
          required
          type='file'
          name='assFile'
          accept='.ass'
          ref={fileInputRef}
          onChange={handleFileChange}
          className='hidden'
        />

        {selectedFileName ? (
          <div className='text-center animate-in zoom-in-95 duration-300'>
            <div className='w-20 h-20 mx-auto mb-4 bg-white text-emerald-500 rounded-full flex items-center justify-center text-4xl shadow-md border border-emerald-100'>
              📄
            </div>
            <div className='text-emerald-700 font-black text-xl mb-1.5'>
              字幕文件已就绪
            </div>
            <div className='text-sm font-bold text-emerald-600/70 mb-4'>
              {selectedFileName}
            </div>
            <div className='text-xs text-emerald-500/60 font-bold bg-emerald-100/50 px-3 py-1 rounded-full inline-block'>
              点击或拖拽可重新选择
            </div>
          </div>
        ) : (
          <div className='text-center'>
            <div
              className={`w-20 h-20 mx-auto mb-5 rounded-full flex items-center justify-center text-4xl shadow-sm transition-colors border ${isDragging ? 'bg-indigo-100 text-indigo-600 border-indigo-200' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
              ⬇️
            </div>
            <div
              className={`font-black text-xl mb-2 transition-colors ${isDragging ? 'text-indigo-600' : 'text-gray-800'}`}>
              {isDragging
                ? '松开鼠标即可放入文件'
                : '点击选择 或 将 .ass 文件拖拽到此处'}
            </div>
            <div className='text-sm font-bold text-gray-400'>
              仅支持 Aegisub 生成的 .ass 格式
            </div>
          </div>
        )}
      </div>

      {/* ================= 4. 提交按钮与状态 ================= */}
      <button
        type='submit'
        disabled={status.type === 'loading'}
        className={`w-full py-5 rounded-2xl font-black text-xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-3 mt-4
          ${status.type === 'loading' ? 'bg-gray-200 text-gray-500 cursor-not-allowed shadow-none' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200 hover:shadow-xl'}
        `}>
        {status.type === 'loading' ? (
          <>
            <svg
              className='animate-spin h-6 w-6 text-gray-500'
              viewBox='0 0 24 24'>
              <circle
                className='opacity-25'
                cx='12'
                cy='12'
                r='10'
                stroke='currentColor'
                strokeWidth='4'
                fill='none'></circle>
              <path
                className='opacity-75'
                fill='currentColor'
                d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'></path>
            </svg>{' '}
            正在深度解析并写入数据库...
          </>
        ) : (
          '🚀 立即解析并上传'
        )}
      </button>

      {status.message && (
        <div
          className={`p-5 rounded-2xl font-bold text-sm animate-in slide-in-from-bottom-4 flex items-center gap-3
          ${status.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}
        `}>
          <span className='text-2xl'>
            {status.type === 'success' ? '🎉' : '❌'}
          </span>
          {status.message}
        </div>
      )}
    </form>
  )
}
