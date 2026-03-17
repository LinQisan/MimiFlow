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
  ShadowreadingUnit1Section1: {
    categoryId: 'speak',
    title: 'Unit1 Section1',
    audioFile: '/audios/02 ユニット「一」セクション「一」.m4a',
    dialogue: [
      {
        id: 1,
        text: '1 そう?',
        start: 4.11,
        end: 6.71,
      },
      {
        id: 2,
        text: 'そう',
        start: 6.93,
        end: 7.73,
      },
      {
        id: 3,
        text: '2 え?どれ?これ?',
        start: 8.45,
        end: 11.96,
      },
      {
        id: 4,
        text: 'うん、それ',
        start: 12.12,
        end: 13.78,
      },
      {
        id: 5,
        text: '3 おいしい?',
        start: 14.26,
        end: 16.57,
      },
      {
        id: 6,
        text: 'うん、おいしいよ',
        start: 16.76,
        end: 18.69,
      },
      {
        id: 7,
        text: '4 はい?',
        start: 19.29,
        end: 21.18,
      },
      {
        id: 8,
        text: 'はい',
        start: 21.55,
        end: 22.36,
      },
      {
        id: 9,
        text: '5 きれい?',
        start: 22.97,
        end: 25.13,
      },
      {
        id: 10,
        text: 'きれい',
        start: 25.33,
        end: 26.22,
      },
      {
        id: 11,
        text: '6 ほんと?',
        start: 26.84,
        end: 29.31,
      },
      {
        id: 12,
        text: 'ほんと',
        start: 29.49,
        end: 30.64,
      },
      {
        id: 13,
        text: '7 たなかさん?',
        start: 31.22,
        end: 33.91,
      },
      {
        id: 14,
        text: 'たなかさん',
        start: 34.1,
        end: 35.26,
      },
      {
        id: 15,
        text: '8 いい?',
        start: 35.99,
        end: 38.31,
      },
      {
        id: 16,
        text: 'いいよ',
        start: 38.53,
        end: 39.44,
      },
      {
        id: 17,
        text: '9 ここ?',
        start: 40.31,
        end: 42.53,
      },
      {
        id: 18,
        text: 'うん、そこ',
        start: 42.85,
        end: 44.58,
      },
      {
        id: 19,
        text: '10 わかった?',
        start: 45.26,
        end: 47.84,
      },
      {
        id: 20,
        text: 'はい、わかりました',
        start: 48.1,
        end: 50.02,
      },
    ],
  },
  ShadowreadingUnit1Section2: {
    categoryId: 'speak',
    title: 'Unit1 Section2',
    audioFile: '/audios/03 ユニット「一」セクション「二」.m4a',
    dialogue: [
      {
        id: 1,
        text: '1 こんにちは。',
        start: 2.18,
        end: 4.29,
      },
      {
        id: 2,
        text: 'こんにちは。',
        start: 4.33,
        end: 5.51,
      },
      {
        id: 3,
        text: '2 先生、おはようございます。',
        start: 6.31,
        end: 9.48,
      },
      {
        id: 4,
        text: 'おはよう。',
        start: 9.53,
        end: 10.63,
      },
      {
        id: 5,
        text: '3 えみさん、じゃーね。',
        start: 11.76,
        end: 14.4,
      },
      {
        id: 6,
        text: 'うん。また明日。',
        start: 14.4,
        end: 16.13,
      },
      {
        id: 7,
        text: '4 お先に失礼します。',
        start: 17.52,
        end: 19.98,
      },
      {
        id: 8,
        text: 'おつかれさまー',
        start: 19.98,
        end: 21.54,
      },
      {
        id: 9,
        text: '5 あ〜あ。',
        start: 22.59,
        end: 25.29,
      },
      {
        id: 10,
        text: 'すみません。',
        start: 25.29,
        end: 26.84,
      },
      {
        id: 11,
        text: '6 いってきます。',
        start: 27.82,
        end: 29.94,
      },
      {
        id: 12,
        text: 'いってらっしゃい。',
        start: 29.94,
        end: 31.14,
      },
      {
        id: 13,
        text: '7 ただいまー。',
        start: 32.94,
        end: 34.94,
      },
      {
        id: 14,
        text: 'おかえりー。',
        start: 34.94,
        end: 36.13,
      },
      {
        id: 15,
        text: '8 どうもありがとうございます。',
        start: 37.35,
        end: 39.95,
      },
      {
        id: 16,
        text: 'いいえ、どういたしまして。',
        start: 39.95,
        end: 42.15,
      },
      {
        id: 17,
        text: '9 いい天気ですね。',
        start: 43.3,
        end: 45.72,
      },
      {
        id: 18,
        text: 'ええ、そうですね。',
        start: 45.72,
        end: 47.52,
      },
      {
        id: 19,
        text: '10 お元気ですか？',
        start: 48.93,
        end: 51.14,
      },
      {
        id: 20,
        text: 'はい、元気です。',
        start: 51.19,
        end: 52.76,
      },
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
