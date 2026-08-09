import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import { MaterialType, PrismaClient } from '@prisma/client'
import { access, readdir, rename } from 'node:fs/promises'
import path from 'node:path'

const SECTION_LABELS = {
  1: '課題理解',
  2: 'ポイント理解',
  3: '概要理解',
  4: '即時応答',
  5: '統合理解',
}

const applyChanges = process.argv.includes('--apply')
const targetDirectory = path.join(process.cwd(), 'public', 'audios', 'N1', '202507')
const webDirectory = '/audios/N1/202507'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const asRecord = value =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}

const exists = async filePath => {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

const parseLegacyFilename = fileName => {
  const match = fileName.match(/^202507N1-(\d{2})-(\d{2})\.mp3$/i)
  if (!match) return null
  const sectionNumber = Number(match[1])
  const questionNumber = Number(match[2])
  if (!sectionNumber || !questionNumber) return null
  const sectionLabel = SECTION_LABELS[sectionNumber] || `問題${sectionNumber}`
  return {
    sectionNumber,
    questionNumber,
    sectionLabel,
    title: `問題${sectionNumber}-${String(questionNumber).padStart(2, '0')}｜${sectionLabel}`,
    fileName: `2025-07-N1-P${String(sectionNumber).padStart(2, '0')}-Q${String(questionNumber).padStart(2, '0')}.mp3`,
  }
}

async function main() {
  const fileNames = (await readdir(targetDirectory)).sort((a, b) =>
    a.localeCompare(b, 'en', { numeric: true }),
  )
  const plans = fileNames.flatMap(fileName => {
    const identity = parseLegacyFilename(fileName)
    return identity ? [{ oldFileName: fileName, ...identity }] : []
  })

  if (plans.length === 0) {
    console.log('未找到需要规范化的 202507 N1 音频。')
    return
  }

  console.log(`${applyChanges ? '将执行' : '预览'} ${plans.length} 条 N1 听力改名：`)

  for (const plan of plans) {
    const oldWebPath = `${webDirectory}/${plan.oldFileName}`
    const nextWebPath = `${webDirectory}/${plan.fileName}`
    const oldAbsolutePath = path.join(targetDirectory, plan.oldFileName)
    const nextAbsolutePath = path.join(targetDirectory, plan.fileName)
    const materials = await prisma.material.findMany({
      where: {
        type: MaterialType.LISTENING,
        OR: [
          { contentPayload: { path: ['audioFile'], equals: oldWebPath } },
          { contentPayload: { path: ['audioUrl'], equals: oldWebPath } },
        ],
      },
      select: {
        id: true,
        contentPayload: true,
        questions: { select: { id: true, content: true } },
      },
    })

    console.log(
      `- ${plan.oldFileName} -> ${plan.fileName} | ${plan.title} | 听力材料 ${materials.length}`,
    )
    if (!applyChanges) continue

    if (await exists(nextAbsolutePath)) {
      throw new Error(`目标文件已存在：${nextAbsolutePath}`)
    }

    await rename(oldAbsolutePath, nextAbsolutePath)
    try {
      await prisma.$transaction(async tx => {
        for (const material of materials) {
          const contentPayload = asRecord(material.contentPayload)
          await tx.material.update({
            where: { id: material.id },
            data: {
              title: plan.title,
              contentPayload: {
                ...contentPayload,
                audioFile: nextWebPath,
                audioUrl: nextWebPath,
                listeningSectionNumber: plan.sectionNumber,
                sectionNumber: plan.sectionNumber,
                listeningSectionTitle: plan.sectionLabel,
                sectionTitle: plan.sectionLabel,
                questionNumber: plan.questionNumber,
                jlptLevel: 'N1',
                jlptSession: '2025-07',
              },
            },
          })

          for (const question of material.questions) {
            const content = asRecord(question.content)
            await tx.question.update({
              where: { id: question.id },
              data: {
                content: {
                  ...content,
                  listeningSectionNumber: plan.sectionNumber,
                  sectionNumber: plan.sectionNumber,
                  listeningSectionTitle: plan.sectionLabel,
                  sectionTitle: plan.sectionLabel,
                  questionNumber: plan.questionNumber,
                },
              },
            })
          }
        }
      })
    } catch (error) {
      await rename(nextAbsolutePath, oldAbsolutePath)
      throw error
    }
  }

  if (!applyChanges) {
    console.log('\n未修改数据。加 --apply 后执行。')
  } else {
    console.log('\nN1 听力文件、材料标题与所属問題元数据已同步。')
  }
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
