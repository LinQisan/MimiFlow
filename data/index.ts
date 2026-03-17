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
  title: string
  audioFile: string
  dialogue: DialogueItem[]
}

// 存放所有数据
export const lessonData: Record<string, Lesson> = {
  N1: {
    categoryId: 'n1',
    title: 'N1: 202507-01-01',
    audioFile: '/audios/202507N1-01-01.mp3',
    dialogue: [
      {
        id: 1,
        text: '１番　大学の事務室で男の学生が係の女の人と話しています。',
        start: 0.0,
        end: 8.0,
      },
      {
        id: 2,
        text: '男の学生はこの後、事務室に何を再提出しますか。',
        start: 8.0,
        end: 15.0,
      },
      {
        id: 3,
        text: 'バスケットボールのサークルで来月合宿に行くんですけど、',
        start: 16.0,
        end: 19.8,
      },
      { id: 4, text: 'その手続きに参りました。', start: 20, end: 22 },
      { id: 5, text: 'これ、合宿の申請書です。', start: 22.0, end: 24.0 },
      {
        id: 6,
        text: 'はい。申請には別途活動計画書も必要なんですが、',
        start: 24.0,
        end: 29.0,
      },
      { id: 7, text: 'お持ちですか？', start: 29.0, end: 30.0 },
      {
        id: 8,
        text: 'はい。',
        start: 30.41,
        end: 31.0,
      },
      {
        id: 9,
        text: 'ではまず、合宿の申請書 確認しますね。',
        start: 31.2,
        end: 35.0,
      },
      {
        id: 10,
        text: '不備があると再提出になります。',
        start: 31.2,
        end: 35.0,
      },
    ],
  },
  Shadowreading: {
    categoryId: 'speak',
    title: 'Unit1',
    audioFile: '/audios/02 ユニット「一」セクション「一」.m4a',
    dialogue: [
      { id: 1, text: '1 そう?', start: 4.21, end: 6.41 },
      { id: 2, text: 'そう', start: 7.03, end: 7.43 },
      { id: 3, text: '2 え?どれ?これ?', start: 8.55, end: 11.69 },
      { id: 4, text: 'うん、それ', start: 12.22, end: 13.48 },
      { id: 5, text: '3 おいしい?', start: 14.36, end: 16.28 },
      { id: 6, text: 'うん、おいしいよ', start: 16.86, end: 18.39 },
      { id: 7, text: '4 はい?', start: 19.39, end: 20.88 },
      { id: 8, text: 'はい', start: 21.65, end: 22.06 },
      { id: 9, text: '5 きれい?', start: 23.07, end: 24.84 },
      { id: 10, text: 'きれい', start: 25.43, end: 25.92 },
      { id: 11, text: '6 ほんと?', start: 26.94, end: 29.04 },
      { id: 12, text: 'ほんと', start: 29.59, end: 30.34 },
      { id: 13, text: '7 たなかさん?', start: 31.32, end: 33.61 },
      { id: 14, text: 'たなかさん', start: 34.2, end: 34.96 },
      { id: 15, text: '8 いい?', start: 36.09, end: 38.01 },
      { id: 16, text: 'いいよ', start: 38.63, end: 39.14 },
      { id: 17, text: '9 ここ?', start: 40.41, end: 42.23 },
      { id: 18, text: 'うん、そこ', start: 42.95, end: 44.28 },
      { id: 19, text: '10 わかった?', start: 45.36, end: 47.54 },
      { id: 20, text: 'はい、わかりました', start: 48.2, end: 49.72 },
    ],
  },
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
