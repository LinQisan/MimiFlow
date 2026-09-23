import 'server-only'

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { promisify } from 'node:util'
import { zstdDecompress } from 'node:zlib'

import JSZip from 'jszip'
import { inferAnkiNotebookPath } from '@/modules/import/domain/anki-package'
import { AUDIO_EXTENSIONS } from '@/modules/media/audio/domain/storage'

export type AnkiPackageNote = {
  rowNo: number
  deckName: string
  fields: Record<string, string>
  tags: string[]
}

export type AnkiPackageAudio = {
  name: string
  data: Buffer
}

export type ParsedAnkiPackage = {
  notes: AnkiPackageNote[]
  deckNames: string[]
  audioFiles: AnkiPackageAudio[]
  suggestedNotebookName: string
}

type DatabaseRow = Record<string, unknown>

const MAX_PACKAGE_BYTES = 90 * 1024 * 1024
const MAX_DATABASE_BYTES = 128 * 1024 * 1024
const MAX_PACKAGE_NOTES = 5_000
const MAX_AUDIO_BYTES = 256 * 1024 * 1024
const FIELD_SEPARATOR = '\u001f'
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const decompressZstd = promisify(zstdDecompress)

function isZstd(buffer: Buffer) {
  return buffer.subarray(0, ZSTD_MAGIC.length).equals(ZSTD_MAGIC)
}

async function maybeDecompressZstd(buffer: Buffer) {
  if (!isZstd(buffer)) {
    if (buffer.length > MAX_DATABASE_BYTES) {
      throw new Error('Anki 数据解压后过大，无法安全导入。')
    }
    return buffer
  }
  const decompressed = Buffer.from(await decompressZstd(buffer))
  if (decompressed.length > MAX_DATABASE_BYTES) {
    throw new Error('Anki 数据解压后过大，无法安全导入。')
  }
  return decompressed
}

function readVarint(buffer: Buffer, start: number) {
  let value = 0
  let shift = 0
  let offset = start
  while (offset < buffer.length && shift <= 49) {
    const byte = buffer[offset]
    value += (byte & 0x7f) * 2 ** shift
    offset += 1
    if ((byte & 0x80) === 0) return { value, offset }
    shift += 7
  }
  throw new Error('Anki 媒体索引损坏。')
}

function skipProtobufField(buffer: Buffer, offset: number, wireType: number) {
  if (wireType === 0) return readVarint(buffer, offset).offset
  if (wireType === 1) return offset + 8
  if (wireType === 2) {
    const length = readVarint(buffer, offset)
    return length.offset + length.value
  }
  if (wireType === 5) return offset + 4
  throw new Error('Anki 媒体索引包含不支持的字段。')
}

function parseMediaEntry(buffer: Buffer) {
  let offset = 0
  let name = ''
  while (offset < buffer.length) {
    const tag = readVarint(buffer, offset)
    offset = tag.offset
    const fieldNumber = Math.floor(tag.value / 8)
    const wireType = tag.value & 7
    if (fieldNumber === 1 && wireType === 2) {
      const length = readVarint(buffer, offset)
      const end = length.offset + length.value
      if (end > buffer.length) throw new Error('Anki 媒体名称不完整。')
      name = buffer.subarray(length.offset, end).toString('utf8')
      offset = end
    } else {
      offset = skipProtobufField(buffer, offset, wireType)
    }
  }
  return { name }
}

export function parseAnkiMediaEntries(buffer: Buffer) {
  const entries: Array<{ name: string; zipFilename: string }> = []
  let offset = 0
  let entryIndex = 0
  while (offset < buffer.length) {
    const tag = readVarint(buffer, offset)
    offset = tag.offset
    const fieldNumber = Math.floor(tag.value / 8)
    const wireType = tag.value & 7
    if (fieldNumber !== 1 || wireType !== 2) {
      offset = skipProtobufField(buffer, offset, wireType)
      continue
    }
    const length = readVarint(buffer, offset)
    const end = length.offset + length.value
    if (end > buffer.length) throw new Error('Anki 媒体索引不完整。')
    const entry = parseMediaEntry(buffer.subarray(length.offset, end))
    if (entry.name) {
      entries.push({
        name: entry.name,
        zipFilename: String(entryIndex),
      })
    }
    entryIndex += 1
    offset = end
  }
  return entries
}

function normalizeDeckName(value: string) {
  return value
    .split(/\u001f|::/)
    .map(segment => segment.trim())
    .filter(Boolean)
    .join(' / ')
}

function readModernNotes(database: DatabaseSync) {
  const fieldRows = database
    .prepare('SELECT ntid, ord, name FROM fields ORDER BY ntid, ord')
    .all() as DatabaseRow[]
  const fieldsByNotetype = new Map<string, string[]>()
  for (const row of fieldRows) {
    const id = String(row.ntid)
    const names = fieldsByNotetype.get(id) || []
    names[Number(row.ord)] = String(row.name || '')
    fieldsByNotetype.set(id, names)
  }
  const rows = database
    .prepare(`
      SELECT n.id, n.mid, n.tags, n.flds, COALESCE(d.name, '') AS deck_name
      FROM notes n
      LEFT JOIN (
        SELECT nid, MIN(did) AS did
        FROM cards
        GROUP BY nid
      ) c ON c.nid = n.id
      LEFT JOIN decks d ON d.id = c.did
      ORDER BY n.id
      LIMIT ?
    `)
    .all(MAX_PACKAGE_NOTES + 1) as DatabaseRow[]
  return rows.map((row, index) => ({
    rowNo: index + 1,
    deckName: normalizeDeckName(String(row.deck_name || '')),
    fieldNames: fieldsByNotetype.get(String(row.mid)) || [],
    fieldValues: String(row.flds || '').split(FIELD_SEPARATOR),
    tags: String(row.tags || '').trim().split(/\s+/).filter(Boolean),
  }))
}

async function readPackageNotes(databaseBuffer: Buffer) {
  if (!databaseBuffer.subarray(0, 16).toString('utf8').startsWith('SQLite format 3')) {
    throw new Error('APKG 中的 Anki 数据库无效。')
  }
  const directory = await mkdtemp(path.join(tmpdir(), 'mimiflow-anki-'))
  const databasePath = path.join(directory, 'collection.anki2')
  let database: DatabaseSync | null = null
  try {
    await writeFile(databasePath, databaseBuffer)
    const writableDatabase = new DatabaseSync(databasePath, {
      defensive: false,
    })
    try {
      const row = writableDatabase
        .prepare(`
          SELECT COUNT(*) AS count
          FROM sqlite_schema
          WHERE sql LIKE '%COLLATE unicase%'
        `)
        .get() as { count?: number } | undefined
      if (Number(row?.count) > 0) {
        const schemaVersion = writableDatabase
          .prepare('PRAGMA schema_version')
          .get() as { schema_version?: number } | undefined
        writableDatabase.exec('PRAGMA writable_schema = ON')
        writableDatabase
          .prepare(`
            UPDATE sqlite_schema
            SET sql = replace(sql, ' COLLATE unicase', '')
            WHERE sql LIKE '%COLLATE unicase%'
          `)
          .run()
        writableDatabase.exec(
          `PRAGMA schema_version = ${Number(schemaVersion?.schema_version || 0) + 1}`,
        )
        writableDatabase.exec('PRAGMA writable_schema = OFF')
      }
    } finally {
      writableDatabase.close()
    }
    database = new DatabaseSync(databasePath, { readOnly: true })
    const rows = readModernNotes(database)
    if (rows.length > MAX_PACKAGE_NOTES) {
      throw new Error(`APKG 超过 ${MAX_PACKAGE_NOTES} 条笔记，无法一次导入。`)
    }
    return rows
  } finally {
    database?.close()
    await rm(directory, { recursive: true, force: true })
  }
}

function readSoundNames(values: string[]) {
  const names = new Set<string>()
  for (const value of values) {
    for (const match of value.matchAll(/\[sound:([^\]]+)\]/gi)) {
      const name = path.basename(match[1] || '').trim()
      if (name) names.add(name)
    }
  }
  return names
}

async function readMediaIndex(zip: JSZip) {
  const entry = zip.file('media')
  if (!entry) return []
  const raw = Buffer.from(await entry.async('nodebuffer'))
  const decoded = await maybeDecompressZstd(raw)
  return parseAnkiMediaEntries(decoded)
}

export async function parseAnkiPackage(
  packageBuffer: Buffer,
  fileName: string,
): Promise<ParsedAnkiPackage> {
  if (packageBuffer.length === 0 || packageBuffer.length > MAX_PACKAGE_BYTES) {
    throw new Error('APKG 文件为空或超过 90 MB。')
  }
  const zip = await JSZip.loadAsync(packageBuffer, { checkCRC32: true })
  const collectionEntry = zip.file('collection.anki21b')
  if (!collectionEntry) throw new Error('APKG 中没有 Anki 数据库。')
  const databaseBuffer = await maybeDecompressZstd(
    Buffer.from(await collectionEntry.async('nodebuffer')),
  )
  const rawNotes = await readPackageNotes(databaseBuffer)
  const notes: AnkiPackageNote[] = rawNotes.map(row => ({
    rowNo: row.rowNo,
    deckName: row.deckName,
    fields: Object.fromEntries(
      row.fieldValues.map((value, index) => [
        row.fieldNames[index] || `field_${index + 1}`,
        value,
      ]),
    ),
    tags: row.tags,
  }))
  const deckNames = Array.from(
    new Set(notes.map(note => note.deckName).filter(Boolean)),
  )
  const referencedMedia = readSoundNames(
    notes.flatMap(note => Object.values(note.fields)),
  )
  const mediaIndex = await readMediaIndex(zip)
  const audioFiles: AnkiPackageAudio[] = []
  let totalAudioBytes = 0
  for (const media of mediaIndex) {
    const safeName = path.basename(media.name).trim()
    if (
      !safeName ||
      safeName !== media.name ||
      !referencedMedia.has(safeName) ||
      !AUDIO_EXTENSIONS.has(path.extname(safeName).toLowerCase())
    ) {
      continue
    }
    const mediaEntry = zip.file(media.zipFilename)
    if (!mediaEntry) continue
    const archivedData = Buffer.from(await mediaEntry.async('nodebuffer'))
    const data = await maybeDecompressZstd(archivedData)
    totalAudioBytes += data.length
    if (totalAudioBytes > MAX_AUDIO_BYTES) {
      throw new Error('APKG 中引用的音频解压后超过 256 MB。')
    }
    audioFiles.push({ name: safeName, data })
  }
  return {
    notes,
    deckNames,
    audioFiles,
    suggestedNotebookName: inferAnkiNotebookPath(deckNames, fileName),
  }
}
