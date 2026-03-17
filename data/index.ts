import { n1Lessons } from './lessons/n1'
import { speakLessons } from './lessons/speak'
export type DialogueItem = {
  id: number
  text: string
  start: number
  end: number
}

// 定义分类的类型
export type Category = {
  id: string
  title: string
  description: string
}

// 2. 新增：这里配置你的所有分类（一级目录）
export const categories: Category[] = [
  { id: 'n1', title: 'N1 听力', description: '包含 N1 历年真题及模拟题' },
  { id: 'n2', title: 'N2 听力', description: '包含 N2 历年真题及模拟题' },
  { id: 'speak', title: '口语', description: '日常口语材料' },
]

// 定义每节课的类型
export type Lesson = {
  categoryId: string
  groupTitle?: string
  title: string
  audioFile: string
  dialogue: DialogueItem[]
}

// 存放所有数据
export const lessonData: Record<string, Lesson> = {
  ...n1Lessons,
  ...speakLessons,
}

export function getLessonById(id: string): Lesson | null {
  return lessonData[id] || null
}

export function getCategoryById(id: string): Category | null {
  return categories.find(c => c.id === id) || null
}

// 5. 新增：根据分类 ID 获取该分类下的所有课程
export function getLessonsByCategory(categoryId: string) {
  return Object.entries(lessonData)
    .filter(([_, lesson]) => lesson.categoryId === categoryId)
    .map(([id, lesson]) => ({ id, ...lesson })) // 把对象的 key (如 "1") 塞进对象里变成 id
}
