'use client'

import { useState } from 'react'
import { uploadAssAndSaveData } from './action'
import Link from 'next/link'

export default function AssUploadPage() {
  const [status, setStatus] = useState<{
    type: 'idle' | 'loading' | 'success' | 'error'
    message: string
  }>({ type: 'idle', message: '' })

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus({
      type: 'loading',
      message: '🚀 正在解析 ASS 文件并写入数据库...',
    })

    const formData = new FormData(event.currentTarget)

    // 调用 Server Action
    const result = await uploadAssAndSaveData(formData)

    if (result.success) {
      setStatus({ type: 'success', message: result.message })
      // 可选：成功后清空表单
      event.currentTarget.reset()
    } else {
      setStatus({ type: 'error', message: result.message })
    }
  }

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
          href='/'
          style={{
            color: '#0070f3',
            textDecoration: 'none',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}>
          <span>← 返回主页</span>
        </Link>
      </div>
      <h1>🎬 上传新题目 (ASS字幕录入)</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        填写题目信息并上传 .ass 文件，系统将自动进行时间轴智能排版并存入数据库。
      </p>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {/* 1. 分类信息 */}
        <fieldset
          style={{
            border: '1px solid #ddd',
            padding: '15px',
            borderRadius: '8px',
          }}>
          <legend style={{ fontWeight: 'bold' }}>分类信息 (Category)</legend>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <input
              required
              name='categoryId'
              placeholder='分类ID (例: N1_202507)'
              style={inputStyle}
            />
            {/* 🌟 核心修改 1：让选项完美匹配数据库里的 Level ID */}
            <select required name='level' style={inputStyle}>
              <option value='n1'>N1 听力</option>
              <option value='n2'>N2 听力</option>
              <option value='speak'>口语材料</option>
            </select>
          </div>
          <input
            required
            name='categoryName'
            placeholder='分类名称 (例: 2025年7月 N1真题)'
            style={{ ...inputStyle, width: '100%', marginBottom: '10px' }}
          />

          {/* 🌟 核心修改 2：新增描述输入框 (由于数据库设为可选，这里不加 required) */}
          <textarea
            name='description'
            placeholder='试卷描述 (选填，例：本次考试难度较大，包含完整的听力原文...)'
            style={{
              ...inputStyle,
              width: '100%',
              minHeight: '80px',
              resize: 'vertical',
            }}
          />
        </fieldset>

        {/* 2. 课程信息 */}
        <fieldset
          style={{
            border: '1px solid #ddd',
            padding: '15px',
            borderRadius: '8px',
          }}>
          <legend style={{ fontWeight: 'bold' }}>题目信息 (Lesson)</legend>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <input
              required
              name='lessonNum'
              placeholder='编号 (例: 1.1)'
              style={inputStyle}
            />
            <input
              required
              name='title'
              placeholder='题目标题 (例: 問題1-01)'
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>
          <input
            required
            name='audioFile'
            placeholder='音频路径 (例: /audios/N2-01.mp3)'
            style={{ ...inputStyle, width: '100%' }}
          />
        </fieldset>

        {/* 3. ASS 文件上传 */}
        <div
          style={{
            border: '2px dashed #0070f3',
            padding: '20px',
            borderRadius: '8px',
            textAlign: 'center',
            backgroundColor: '#f0f7ff',
          }}>
          <label
            style={{
              fontWeight: 'bold',
              display: 'block',
              marginBottom: '10px',
            }}>
            选择 .ass 字幕文件
          </label>
          <input required type='file' name='assFile' accept='.ass' />
        </div>

        {/* 提交按钮 */}
        <button
          type='submit'
          disabled={status.type === 'loading'}
          style={{
            padding: '12px',
            backgroundColor: status.type === 'loading' ? '#ccc' : '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            fontSize: '16px',
            cursor: 'pointer',
            marginTop: '10px',
          }}>
          {status.type === 'loading' ? '⏳ 处理中...' : '💾 解析并保存到数据库'}
        </button>
      </form>

      {/* 状态提示 */}
      {status.message && (
        <div
          style={{
            marginTop: '20px',
            padding: '15px',
            borderRadius: '5px',
            backgroundColor:
              status.type === 'success'
                ? '#e6fffa'
                : status.type === 'error'
                  ? '#fff5f5'
                  : '#ebf8ff',
            color:
              status.type === 'success'
                ? '#2f855a'
                : status.type === 'error'
                  ? '#c53030'
                  : '#2b6cb0',
          }}>
          {status.message}
        </div>
      )}
    </div>
  )
}

// 简单的输入框样式复用
const inputStyle = {
  padding: '8px',
  border: '1px solid #ccc',
  borderRadius: '4px',
}
