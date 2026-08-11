import 'dotenv/config'

import { readFile, writeFile } from 'node:fs/promises'
import pg from 'pg'

const schemaSql = await readFile('drizzle/0000_mimiflow_d1.sql', 'utf8')
const outputPrefix = 'drizzle/0001_local_postgres_snapshot'
const maxMigrationBytes = 400_000
const tablePattern = /CREATE TABLE "([^"]+)" \(\n([\s\S]*?)\n\);/g
const tables = []

for (const match of schemaSql.matchAll(tablePattern)) {
  const columns = match[2]
    .split('\n')
    .map(line => line.match(/^\s+"([^"]+)"\s/))
    .filter(Boolean)
    .map(columnMatch => columnMatch[1])
  tables.push({ name: match[1], columns })
}

if (tables.length === 0) throw new Error('No D1 tables found in schema migration')
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured')

const quoteIdentifier = value => `"${value.replaceAll('"', '""')}"`
const normalizeText = value =>
  (typeof value === 'object' ? JSON.stringify(value) : String(value))
    .replaceAll('\0', '')
const quoteText = value => `'${value.replaceAll("'", "''")}'`
const sqlLiteral = value => {
  if (value === null || value === undefined) return 'NULL'
  if (value instanceof Date) {
    return `'${value.toISOString().replace('Z', '+00:00')}'`
  }
  if (Buffer.isBuffer(value)) return `X'${value.toString('hex')}'`
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Unsupported number: ${value}`)
    return String(value)
  }
  if (typeof value === 'bigint') return String(value)
  return quoteText(normalizeText(value))
}

const splitLargeText = value => {
  if (
    value === null ||
    value === undefined ||
    value instanceof Date ||
    Buffer.isBuffer(value) ||
    !['string', 'object'].includes(typeof value)
  ) {
    return null
  }

  const text = normalizeText(value)
  if (Buffer.byteLength(quoteText(text)) <= 30_000) return null

  const parts = []
  let part = ''
  let partBytes = 0
  for (const character of text) {
    const escaped = character === "'" ? "''" : character
    const bytes = Buffer.byteLength(escaped)
    if (part && partBytes + bytes > 24_000) {
      parts.push(part)
      part = ''
      partBytes = 0
    }
    part += character
    partBytes += bytes
  }
  if (part) parts.push(part)
  return parts
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

const statements = []
let totalRows = 0

try {
  for (const table of tables) {
    const columnSql = table.columns.map(quoteIdentifier).join(', ')
    const orderSql =
      table.name === 'wordbooks'
        ? ' ORDER BY CASE WHEN "parentId" IS NULL THEN 0 ELSE 1 END'
        : table.name === 'collections'
          ? ' ORDER BY CASE WHEN "parent_id" IS NULL THEN 0 ELSE 1 END'
          : ''
    const { rows } = await client.query(
      `SELECT ${columnSql} FROM ${quoteIdentifier(table.name)}${orderSql}`,
    )
    if (rows.length === 0) continue

    totalRows += rows.length
    const prefix = `INSERT OR IGNORE INTO ${quoteIdentifier(table.name)} (${columnSql}) VALUES\n`
    let batch = []
    let batchLength = prefix.length

    const flush = () => {
      if (batch.length === 0) return
      statements.push({
        table: table.name,
        sql: `${prefix}${batch.join(',\n')};`,
      })
      batch = []
      batchLength = prefix.length
    }

    for (const row of rows) {
      const largeColumns = table.columns
        .map(column => ({ column, parts: splitLargeText(row[column]) }))
        .filter(entry => entry.parts)
      const values = `(${table.columns
        .map(column =>
          largeColumns.some(entry => entry.column === column)
            ? "''"
            : sqlLiteral(row[column]),
        )
        .join(', ')})`

      if (largeColumns.length > 0) {
        if (!table.columns.includes('id')) {
          throw new Error(`Cannot chunk large values in ${table.name} without an id column`)
        }
        flush()
        statements.push({ table: table.name, sql: `${prefix}${values};` })
        for (const { column, parts } of largeColumns) {
          for (const part of parts) {
            statements.push({
              table: table.name,
              sql: `UPDATE ${quoteIdentifier(table.name)} SET ${quoteIdentifier(column)} = ${quoteIdentifier(column)} || ${quoteText(part)} WHERE "id" = ${sqlLiteral(row.id)} AND changes() = 1;`,
            })
          }
        }
        continue
      }

      if (batch.length > 0 && batchLength + values.length > 48_000) flush()
      batch.push(values)
      batchLength += values.length + 2
    }
    flush()
  }
} finally {
  await client.end()
}

const header = [
  '-- Generated from the local PostgreSQL database for Sites D1.',
  '-- Existing D1 rows win on primary-key or unique-key conflicts.',
  '',
].join('\n')
const migrations = []
let current = header
let currentTable = null

for (const statement of statements) {
  const tableComment =
    statement.table === currentTable ? '' : `-- ${statement.table}\n`
  const block = `${tableComment}${statement.sql}\n\n`
  if (
    current !== header &&
    Buffer.byteLength(current) + Buffer.byteLength(block) > maxMigrationBytes
  ) {
    migrations.push(current)
    current = header
    currentTable = null
  }
  current += `${statement.table === currentTable ? '' : `-- ${statement.table}\n`}${statement.sql}\n\n`
  currentTable = statement.table
}

current += 'PRAGMA optimize;\n'
migrations.push(current)

for (const [index, migration] of migrations.entries()) {
  const outputPath = `${outputPrefix}_${String(index + 1).padStart(2, '0')}.sql`
  await writeFile(outputPath, migration)
}

console.log(`${migrations.length} migrations: ${totalRows} rows`)
