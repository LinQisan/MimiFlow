import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import { CollectionType, PrismaClient } from '@prisma/client'

const applyChanges = process.argv.includes('--apply')
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const asRecord = value =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}

async function main() {
  const papers = await prisma.collection.findMany({
    where: { collectionType: CollectionType.PAPER },
    select: {
      id: true,
      title: true,
      materials: {
        select: {
          material: {
            select: {
              questions: {
                select: {
                  id: true,
                  content: true,
                  options: true,
                },
              },
            },
          },
        },
      },
    },
  })

  const questionsById = new Map()
  for (const paper of papers) {
    for (const relation of paper.materials) {
      for (const question of relation.material.questions) {
        questionsById.set(question.id, question)
      }
    }
  }

  const questions = [...questionsById.values()]
  const pending = questions.filter(question => {
    const content = asRecord(question.content)
    return (
      content.optionLabelFormat !== 'numeric' ||
      (Array.isArray(content.customOptionLabels) &&
        content.customOptionLabels.length > 0)
    )
  })
  const nonFourOptionCount = questions.filter(
    question => !Array.isArray(question.options) || question.options.length !== 4,
  ).length

  console.log(`正式试卷：${papers.length} 份`)
  console.log(`试卷题目：${questions.length} 道`)
  console.log(`需要改为 1、2、3、4：${pending.length} 道`)
  console.log(`非四选项题目：${nonFourOptionCount} 道（只改显示格式，不改选项）`)

  if (!applyChanges) {
    console.log('当前为预览；添加 --apply 后执行。')
    return
  }

  await prisma.$transaction(async tx => {
    for (const question of pending) {
      await tx.question.update({
        where: { id: question.id },
        data: {
          content: {
            ...asRecord(question.content),
            optionLabelFormat: 'numeric',
            customOptionLabels: [],
          },
        },
      })
    }
  })

  console.log(`已更新 ${pending.length} 道题目。`)
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
