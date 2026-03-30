// app/admin/upload/UploadForm.tsx
'use client'

import { useState, useRef } from 'react'
import { uploadAssAndSaveData } from './action'

type Props = {
  levels: { id: string; title: string }[]
  categories: {
    id: string
    name: string
    level: { title: string }
    // 🌟 1. 新增：接收从后端传来的最新题目完整信息
    lessons: {
      lessonNum: string
      title: string
      audioFile: string
    }[]
  }[]
}

export default function UploadForm({ levels, categories }: Props) {
  const [mode, setMode] = useState<'existing' | 'new'>(
    categories.length > 0 ? 'existing' : 'new',
  )
  // 🌟 2. 新增状态：记录用户当前在下拉框里选了哪个旧分类
  const [selectedCategoryId, setSelectedCategoryId] = useState('')

  const [status, setStatus] = useState<{
    type: 'idle' | 'loading' | 'success' | 'error'
    message: string
  }>({ type: 'idle', message: '' })

  // 🌟 拖拽上传所需的新状态和引用
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget

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
      formElement.reset()
      setSelectedFileName(null)
      // 提交成功后不要清空 selectedCategoryId，方便用户继续传下一集
    }
  }
  // 🌟 拖拽事件处理函数
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
      // 简单校验后缀名
      if (!droppedFile.name.endsWith('.ass')) {
        alert('只能上传 .ass 格式的字幕文件哦！')
        return
      }

      setSelectedFileName(droppedFile.name)

      // 🌟 核心魔法：把拖进来的文件，伪装成点击选择的文件，赋值给隐藏的 input
      if (fileInputRef.current) {
        const dataTransfer = new DataTransfer()
        dataTransfer.items.add(droppedFile)
        fileInputRef.current.files = dataTransfer.files
      }
    }
  }

  // 处理点击选择文件的变化
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFileName(e.target.files[0].name)
    } else {
      setSelectedFileName(null)
    }
  }

  // 触发隐藏的输入框
  const handleZoneClick = () => {
    fileInputRef.current?.click()
  }
  // 🌟 3. 核心计算逻辑：动态生成 Placeholder
  let dynamicLessonNumPlaceholder = '例: 1.1'
  let dynamicTitlePlaceholder = '题目标题 (例: 問題1-01)' // 🌟 默认值
  let dynamicAudioFilePlaceholder = '音频路径 (例: /audios/N2-01.mp3)' // 🌟 默认值

  let lessonNumHint = ''

  if (mode === 'existing' && selectedCategoryId) {
    const targetCategory = categories.find(c => c.id === selectedCategoryId)
    if (targetCategory && targetCategory.lessons.length > 0) {
      const latestLesson = targetCategory.lessons[0] // 获取最新一条题目的完整对象
      const {
        lessonNum: latestNum,
        title: latestTitle,
        audioFile: latestAudio,
      } = latestLesson

      // 针对 LessonNum 的提示
      dynamicLessonNumPlaceholder = `当前最新为: ${latestNum}，请顺延填写`
      lessonNumHint = `(该组最新一题是: ${latestNum})`

      // 🌟 针对 Title 的提示
      dynamicTitlePlaceholder = `当前最新为: ${latestTitle}，建议沿用格式`

      // 🌟 针对 AudioFile 的提示
      // 对于音频路径，我们通常提示它所在的目录，方便用户快速定位
      const audioDir = latestAudio.substring(
        0,
        latestAudio.lastIndexOf('/') + 1,
      )
      dynamicAudioFilePlaceholder = `当前最新为: ${latestAudio}，建议沿用目录 ${audioDir}`
    } else {
      dynamicLessonNumPlaceholder = '当前组为空，可填: 1.1'
      // 如果为空，Title 和 AudioFile 保持默认
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
      <input type='hidden' name='uploadMode' value={mode} />

      <fieldset
        style={{
          border: '1px solid #ddd',
          padding: '15px',
          borderRadius: '8px',
          backgroundColor: '#fafafa',
        }}>
        <legend style={{ fontWeight: 'bold' }}>1. 分类归属 (Category)</legend>

        <div style={{ display: 'flex', gap: '20px', marginBottom: '15px' }}>
          <label
            style={{
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}>
            <input
              type='radio'
              checked={mode === 'existing'}
              onChange={() => setMode('existing')}
              disabled={categories.length === 0}
            />
            添加到已有试卷/单元组
          </label>
          <label
            style={{
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}>
            <input
              type='radio'
              checked={mode === 'new'}
              onChange={() => setMode('new')}
            />
            创建全新的试卷/单元组
          </label>
        </div>

        {mode === 'existing' ? (
          <div>
            <select
              required
              name='categoryId'
              value={selectedCategoryId}
              onChange={e => setSelectedCategoryId(e.target.value)} // 🌟 监听用户选择
              style={{ ...inputStyle, width: '100%' }}>
              <option value='' disabled>
                -- 请选择要添加题目的分类 --
              </option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  [{c.level.title}] {c.name} (ID: {c.id})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                required
                name='categoryId'
                placeholder='新ID (例: en_nce_1_u01)'
                style={{ ...inputStyle, flex: 1 }}
              />
              <select required name='level' style={inputStyle}>
                <option value=''>- 选择大模块 -</option>
                {levels.map(lvl => (
                  <option key={lvl.id} value={lvl.id}>
                    {lvl.title}
                  </option>
                ))}
              </select>
            </div>
            <input
              required
              name='categoryName'
              placeholder='分类名称 (例: 新概念一册 单元1)'
              style={{ ...inputStyle, width: '100%' }}
            />
            <textarea
              name='description'
              placeholder='分类描述 (选填)'
              style={{ ...inputStyle, width: '100%', minHeight: '60px' }}
            />
          </div>
        )}
      </fieldset>

      <fieldset
        style={{
          border: '1px solid #ddd',
          padding: '15px',
          borderRadius: '8px',
        }}>
        <legend style={{ fontWeight: 'bold' }}>2. 题目信息 (Lesson)</legend>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          <div style={{ flex: '0 0 40%' }}>
            <input
              required
              name='lessonNum'
              placeholder={dynamicLessonNumPlaceholder}
              style={{ ...inputStyle, width: '100%' }}
            />
            {lessonNumHint && (
              <div
                style={{
                  fontSize: '12px',
                  color: '#666',
                  marginTop: '4px',
                  paddingLeft: '4px',
                }}>
                {lessonNumHint}
              </div>
            )}
          </div>
          <input
            required
            name='title'
            placeholder={dynamicTitlePlaceholder} // 🌟 动态替换：应用智能提示
            style={{ ...inputStyle, flex: 1, alignSelf: 'flex-start' }}
          />
        </div>
        <input
          required
          name='audioFile'
          placeholder={dynamicAudioFilePlaceholder} // 🌟 动态替换：应用智能提示
          style={{ ...inputStyle, width: '100%' }}
        />
      </fieldset>

      {/* 🌟 3. 全新的拖拽文件上传区 */}
      <div
        onClick={handleZoneClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${isDragging ? '#2563eb' : selectedFileName ? '#10b981' : '#ccc'}`,
          padding: '30px 20px',
          borderRadius: '8px',
          textAlign: 'center',
          backgroundColor: isDragging
            ? '#eff6ff'
            : selectedFileName
              ? '#ecfdf5'
              : '#fafafa',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}>
        {/* 隐藏真正的文件选择框 */}
        <input
          required
          type='file'
          name='assFile'
          accept='.ass'
          ref={fileInputRef}
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {selectedFileName ? (
          <div style={{ color: '#059669', fontWeight: 'bold' }}>
            <span
              style={{
                fontSize: '24px',
                display: 'block',
                marginBottom: '8px',
              }}>
              📄
            </span>
            已就绪: {selectedFileName}
            <p
              style={{
                fontSize: '12px',
                color: '#6b7280',
                marginTop: '8px',
                fontWeight: 'normal',
              }}>
              点击或拖拽可更换文件
            </p>
          </div>
        ) : (
          <div style={{ color: isDragging ? '#2563eb' : '#6b7280' }}>
            <span
              style={{
                fontSize: '24px',
                display: 'block',
                marginBottom: '8px',
              }}>
              ⬇️
            </span>
            <span
              style={{
                fontWeight: 'bold',
                fontSize: '16px',
                display: 'block',
              }}>
              {isDragging
                ? '松开鼠标即可放入'
                : '点击选择 或 将 .ass 文件拖拽到此处'}
            </span>
          </div>
        )}
      </div>
      <button
        type='submit'
        disabled={status.type === 'loading'}
        style={{
          padding: '12px',
          backgroundColor: status.type === 'loading' ? '#ccc' : '#0070f3',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
        }}>
        {status.type === 'loading' ? '⏳ 处理中...' : '💾 解析并保存到数据库'}
      </button>

      {status.message && (
        <div
          style={{
            marginTop: '10px',
            padding: '15px',
            borderRadius: '5px',
            backgroundColor: status.type === 'success' ? '#e6fffa' : '#fff5f5',
            color: status.type === 'success' ? '#2f855a' : '#c53030',
          }}>
          {status.message}
        </div>
      )}
    </form>
  )
}

const inputStyle = {
  padding: '8px',
  border: '1px solid #ccc',
  borderRadius: '4px',
}
