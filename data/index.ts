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
  id: string
  title: string
  audioFile: string
  dialogue: DialogueItem[]
}

export type LessonGroup = {
  categoryId: string
  groupTitle: string
  description?: string
  lessons: Lesson[]
}

// 存放所有数据
export const lessonData: Record<string, LessonGroup> = {
  ...n1Lessons,
  ...speakLessons,
}

// ==========================================
// 3. 数据查询方法 (核心修改部分)
// ==========================================

// 1. 获取分类
export function getCategoryById(id: string): Category | null {
  return categories.find(c => c.id === id) || null
}

// 2. 获取某分类下的所有【课程组】 (改名为 getLessonGroupsByCategory 更准确)
// 用于渲染列表页（如 /category/n1），返回该分类下的所有 Unit
export function getLessonGroupsByCategory(categoryId: string) {
  return Object.entries(lessonData)
    .filter(([_, group]) => group.categoryId === categoryId)
    .map(([id, group]) => ({ id, ...group })) // 这里的 id 是 groupId
}

// 3. 根据 ID 获取【整个课程组】
export function getLessonGroupById(groupId: string): LessonGroup | null {
  return lessonData[groupId] || null
}

// 4. 【全新新增】：根据 ID 获取【单节课】及其父级信息
// 这是给播放详情页 /lesson/[id] 用的！它需要遍历寻找具体的 Lesson
export function getLessonById(lessonId: string) {
  for (const [groupId, group] of Object.entries(lessonData)) {
    const foundLesson = group.lessons.find(l => l.id === lessonId)

    if (foundLesson) {
      // 找到后，除了返回 lesson 数据，顺便把所属的 categoryId 和 groupId 也返回
      // 这样在播放页面如果需要实现“返回列表”或者计算“上一题/下一题”，会非常方便
      return {
        ...foundLesson,
        categoryId: group.categoryId,
        groupId: groupId,
      }
    }
  }
  return null // 如果遍历完都没找到，返回 null
}
