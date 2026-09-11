import UploadCenterUI from '@/modules/import/components/UploadCenterUI'
import EpubImportForm from '@/modules/reading/components/EpubImportForm'
import {
  getDefaultListeningQuestionsPerMaterial,
  getUploadPageSeedData,
} from '@/lib/repositories/manage'
import type { UploadCenterTab } from '@/modules/import/types'
import type {
  CollectionType,
  MaterialType,
  QuestionType,
} from '@prisma/client'
import Link from 'next/link'
import PageHeader from '@/components/layout/PageHeader'
import AnkiImportPanel from '@/modules/import/components/AnkiImportPanel'
import ImportNavigation from '@/modules/import/components/ImportNavigation'
import { TOEIC_PARTS } from '@/modules/questions/domain/toeic'
import { PAPER_LISTENING_SECTIONS } from '@/modules/questions/domain/paper-editor'

const importLanguages = [
  {
    value: 'ja',
    label: '日语',
  },
  {
    value: 'en',
    label: '英语',
  },
] as const

type ImportLanguage = (typeof importLanguages)[number]['value']
type ImportScope = 'paper' | 'material' | 'vocabulary'
type ImportType =
  | 'listening'
  | 'speaking'
  | 'reading'
  | 'questions'
  | 'subtitles'
  | 'ebook'
  | 'anki'

type ImportNavigationItem = {
  type: ImportType
  label: string
  enabled: boolean
}

type ImportNavigationGroup = {
  scope: ImportScope
  label: string
  items: ImportNavigationItem[]
}

function getImportGroups(language: ImportLanguage): ImportNavigationGroup[] {
  return [
    {
      scope: 'paper',
      label: '试卷',
      items: [
        {
          type: 'listening',
          label: '听力题',
          enabled: true,
        },
        {
          type: 'reading',
          label: '阅读题',
          enabled: true,
        },
        {
          type: 'questions',
          label: language === 'ja' ? '文字·词汇·语法' : '文法题',
          enabled: true,
        },
      ],
    },
    {
      scope: 'material',
      label: '学习材料',
      items: [
        {
          type: 'speaking',
          label: '跟读材料',
          enabled: true,
        },
        {
          type: 'reading',
          label: '阅读文章',
          enabled: true,
        },
        {
          type: 'subtitles',
          label: '影视字幕',
          enabled: true,
        },
        {
          type: 'ebook',
          label: '电子书',
          enabled: true,
        },
      ],
    },
    {
      scope: 'vocabulary',
      label: '词汇资料',
      items: [
        {
          type: 'anki',
          label: 'Anki 词汇卡片',
          enabled: true,
        },
      ],
    },
  ]
}

const uploadTabs: Partial<Record<ImportType, UploadCenterTab>> = {
  listening: 'audio',
  speaking: 'audio',
  reading: 'article',
  questions: 'quiz',
  subtitles: 'media',
}

const importMaterialTypes: Partial<Record<ImportType, MaterialType>> = {
  listening: 'LISTENING',
  speaking: 'SPEAKING',
  reading: 'READING',
  questions: 'VOCAB_GRAMMAR',
  subtitles: 'MEDIA_SUBTITLE',
  ebook: 'READING',
}

const collectionTypesByScope: Record<
  Exclude<ImportScope, 'vocabulary'>,
  CollectionType[]
> = {
  paper: ['PAPER'],
  material: ['LIBRARY_ROOT', 'BOOK', 'CHAPTER', 'CUSTOM_GROUP'],
}

function isImportLanguage(value: string | undefined): value is ImportLanguage {
  return importLanguages.some(language => language.value === value)
}

function isImportScope(value: string | undefined): value is ImportScope {
  return value === 'paper' || value === 'material' || value === 'vocabulary'
}

export default async function UnifiedImportPage({
  searchParams,
}: {
  searchParams: Promise<{
    language?: string
    scope?: string
    type?: string
    part?: string
  }>
}) {
  const params = await searchParams
  const language: ImportLanguage = isImportLanguage(params.language)
    ? params.language
    : 'ja'
  const importGroups = getImportGroups(language)
  const requestedScope = isImportScope(params.scope)
    ? params.scope
    : 'paper'
  const requestedGroup = importGroups.find(
    group => group.scope === requestedScope,
  )
  const requestedItem = requestedGroup?.items.find(
    item => item.type === params.type && item.enabled,
  )
  const fallbackGroup =
    importGroups.find(group => group.scope === 'paper') ?? importGroups[0]
  const activeGroup = requestedItem ? requestedGroup! : fallbackGroup
  const activeItem =
    requestedItem ?? activeGroup.items.find(item => item.enabled)!
  const importType = activeItem.type
  const toeicPartsForType =
    language !== 'en' || activeGroup.scope !== 'paper'
      ? []
      : TOEIC_PARTS.filter(part =>
          importType === 'listening'
            ? part.part <= 4
            : importType === 'questions'
              ? part.part === 5
              : importType === 'reading'
                ? part.part >= 6
                : false,
        )
  const requestedPartNumber = Number(params.part)
  const toeicPart =
    toeicPartsForType.find(part => part.part === requestedPartNumber) ||
    toeicPartsForType[0]
  const japaneseListeningSections =
    language === 'ja' &&
    activeGroup.scope === 'paper' &&
    importType === 'listening'
      ? PAPER_LISTENING_SECTIONS
      : []
  const japaneseListeningSection =
    japaneseListeningSections.find(
      section => section.sectionNumber === requestedPartNumber,
    ) || japaneseListeningSections[0]
  const resolvedUploadTab = toeicPart?.uploadTab ?? uploadTabs[importType]
  const resolvedMaterialType =
    toeicPart?.materialType ?? importMaterialTypes[importType]
  const needsCollections = importType !== 'anki'
  const needsLessons = ['listening', 'speaking', 'subtitles'].includes(
    importType,
  )
  const collectionTypes =
    activeGroup.scope === 'vocabulary'
      ? undefined
      : collectionTypesByScope[activeGroup.scope]
  const defaultQuestionType = (toeicPart?.questionType ||
    (japaneseListeningSection ? 'LISTENING' : undefined)) as
    | QuestionType
    | undefined
  const fallbackQuestionsPerMaterial =
    toeicPart?.questionType === 'TOEIC_CONVERSATIONS' ||
    toeicPart?.questionType === 'TOEIC_TALKS'
      ? 3
      : 1
  const [uploadSeedData, databaseQuestionsPerMaterial] = await Promise.all([
    needsCollections
      ? getUploadPageSeedData({
          includeLessons: needsLessons,
          materialType: resolvedMaterialType,
          language,
          collectionTypes,
        })
      : Promise.resolve({ dbLevels: [], dbCollections: [] }),
    resolvedMaterialType === 'LISTENING' && defaultQuestionType
      ? getDefaultListeningQuestionsPerMaterial({
          language,
          questionType: defaultQuestionType,
          listeningSectionNumber:
            japaneseListeningSection?.sectionNumber ?? toeicPart?.part,
        })
      : Promise.resolve(null),
  ])
  const { dbLevels, dbCollections } = uploadSeedData
  const defaultQuestionsPerMaterial =
    databaseQuestionsPerMaterial ?? fallbackQuestionsPerMaterial
  return (
    <main className='manage-upload-surface min-h-screen bg-[#f6f5f1] pb-16 font-sans text-slate-900'>
      <div className='mx-auto max-w-6xl px-4 py-5 md:px-8 lg:py-8'>
        <div className='grid gap-6 pt-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-8'>
          <ImportNavigation
            languages={[...importLanguages]}
            groups={importGroups}
            language={language}
            activeScope={activeGroup.scope}
            activeType={importType}
          />

          <section className='min-w-0'>
            <PageHeader
              showTitle
              title={activeItem.label}
              description={`${importLanguages.find(item => item.value === language)?.label ?? language} · ${activeGroup.label}`}
            />

            {toeicPart ? (
              <div className='mb-5 border-b border-slate-300 pb-4'>
                <span className='mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-400'>
                  TOEIC Part
                </span>
                <nav
                  aria-label='选择 TOEIC Part'
                  className='flex flex-wrap gap-x-5 gap-y-2'>
                  {toeicPartsForType.map(part => (
                    <Link
                      key={part.part}
                      href={`/manage/import?language=en&scope=paper&type=${importType}&part=${part.part}`}
                      aria-current={
                        part.part === toeicPart.part ? 'page' : undefined
                      }
                      className={`border-b-2 py-2 text-sm font-bold transition-colors ${
                        part.part === toeicPart.part
                          ? 'border-slate-950 text-slate-950'
                          : 'border-transparent text-slate-400 hover:border-slate-400 hover:text-slate-700'
                      }`}>
                      Part {part.part} · {part.title}
                    </Link>
                  ))}
                </nav>
              </div>
            ) : null}

            {japaneseListeningSection ? (
              <div className='mb-5 border-b border-slate-300 pb-4'>
                <nav
                  aria-label='选择日语听力题型'
                  className='flex flex-wrap gap-x-5 gap-y-2'>
                  {japaneseListeningSections.map(section => (
                    <Link
                      key={section.sectionNumber}
                      href={`/manage/import?language=ja&scope=paper&type=listening&part=${section.sectionNumber}`}
                      aria-current={
                        section.sectionNumber ===
                        japaneseListeningSection.sectionNumber
                          ? 'page'
                          : undefined
                      }
                      className={`border-b-2 py-2 text-sm font-bold transition-colors ${
                        section.sectionNumber ===
                        japaneseListeningSection.sectionNumber
                          ? 'border-slate-950 text-slate-950'
                          : 'border-transparent text-slate-400 hover:border-slate-400 hover:text-slate-700'
                      }`}>
                      問題{section.sectionNumber} · {section.title}
                    </Link>
                  ))}
                </nav>
              </div>
            ) : null}

            {importType === 'ebook' ? (
              <EpubImportForm
                collections={dbCollections}
                defaultLanguage={language}
              />
            ) : importType === 'anki' ? (
              <AnkiImportPanel />
            ) : (
              <UploadCenterUI
                key={`${language}-${activeGroup.scope}-${importType}-${toeicPart?.part || japaneseListeningSection?.sectionNumber || ''}`}
                dbLevels={dbLevels}
                dbCollections={dbCollections}
                initialTab={resolvedUploadTab}
                initialMaterialType={resolvedMaterialType}
                language={language}
                collectionScope={
                  activeGroup.scope === 'paper' ? 'paper' : 'material'
                }
                defaultQuestionType={defaultQuestionType}
                defaultQuestionsPerMaterial={defaultQuestionsPerMaterial}
                defaultListeningSectionNumber={
                  japaneseListeningSection
                    ? String(japaneseListeningSection.sectionNumber)
                    : undefined
                }
                listeningSectionLabel={
                  japaneseListeningSection
                    ? `問題${japaneseListeningSection.sectionNumber} · ${japaneseListeningSection.title}`
                    : undefined
                }
                toeicPartLabel={
                  toeicPart
                    ? `Part ${toeicPart.part} · ${toeicPart.title}`
                    : undefined
                }
              />
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
