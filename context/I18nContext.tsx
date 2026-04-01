'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import zh from '@/locales/zh'
import en from '@/locales/en'
import ja from '@/locales/ja'

// 聚合字典
const dictionaries: Record<string, any> = { zh, en, ja }

export type Language = 'zh' | 'en' | 'ja'

interface I18nContextType {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: string) => string
}

const I18nContext = createContext<I18nContextType | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // 默认中文
  const [lang, setLangState] = useState<Language>('zh')

  // 初始化时从 LocalStorage 读取用户偏好
  useEffect(() => {
    const savedLang = localStorage.getItem('app_lang') as Language
    if (savedLang && dictionaries[savedLang]) {
      setLangState(savedLang)
    }
  }, [])

  // 切换语言并保存到本地
  const setLang = (newLang: Language) => {
    setLangState(newLang)
    localStorage.setItem('app_lang', newLang)
  }

  // 🌟 核心：路径解析翻译函数 (例如 t('player.blindMode'))
  const t = (path: string) => {
    const keys = path.split('.')
    let current = dictionaries[lang]
    for (const key of keys) {
      if (current[key] === undefined) return path // 找不到就返回 key 原文兜底
      current = current[key]
    }
    return current as string
  }

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  )
}

// 封装一个 Hook 方便页面调用
export const useI18n = () => {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used within I18nProvider')
  return context
}
