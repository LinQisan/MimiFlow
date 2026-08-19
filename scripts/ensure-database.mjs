import { spawnSync } from 'node:child_process'

import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config({ path: ['.env.local', '.env'], quiet: true })

const connectionString = process.env.DATABASE_URL
const connectionTimeoutMillis = 1_500
const startupTimeoutMillis = 15_000

if (!connectionString) {
  console.error('[database] DATABASE_URL 未配置，请在 .env.local 中设置。')
  process.exit(1)
}

let databaseUrl
try {
  databaseUrl = new URL(connectionString)
} catch {
  console.error('[database] DATABASE_URL 格式无效。')
  process.exit(1)
}

async function canConnect() {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis })
  try {
    await client.connect()
    await client.query('SELECT 1')
    return true
  } catch {
    return false
  } finally {
    await client.end().catch(() => {})
  }
}

function findHomebrewPostgresService() {
  const result = spawnSync('brew', ['services', 'list', '--json'], {
    encoding: 'utf8',
  })

  if (result.status !== 0) return null

  try {
    const services = JSON.parse(result.stdout)
    const configuredName = process.env.POSTGRES_SERVICE
    if (configuredName) {
      return services.find(service => service.name === configuredName) ?? {
        name: configuredName,
        status: 'none',
      }
    }

    return (
      services.find(
        service => service.name.startsWith('postgresql') && service.status !== 'none',
      ) ?? services.find(service => service.name.startsWith('postgresql'))
    )
  } catch {
    return null
  }
}

async function waitForDatabase() {
  const deadline = Date.now() + startupTimeoutMillis
  while (Date.now() < deadline) {
    if (await canConnect()) return true
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  return false
}

if (await canConnect()) {
  console.log('[database] PostgreSQL 已就绪。')
  process.exit(0)
}

const isLocalDatabase = ['localhost', '127.0.0.1', '::1'].includes(databaseUrl.hostname)
if (process.platform !== 'darwin' || !isLocalDatabase) {
  console.error(
    `[database] 无法连接 ${databaseUrl.hostname}:${databaseUrl.port || '5432'}，请先启动 PostgreSQL。`,
  )
  process.exit(1)
}

const service = findHomebrewPostgresService()
if (!service) {
  console.error('[database] 找不到 Homebrew PostgreSQL 服务，请确认 PostgreSQL 已安装。')
  process.exit(1)
}

const action = service.status === 'error' ? 'restart' : 'start'
console.log(`[database] 正在${action === 'restart' ? '重启' : '启动'} ${service.name}...`)

const startResult = spawnSync('brew', ['services', action, service.name], {
  stdio: 'inherit',
})
if (startResult.status !== 0 || !(await waitForDatabase())) {
  console.error(
    `[database] ${service.name} 未能在 ${startupTimeoutMillis / 1000} 秒内就绪，请运行 brew services info ${service.name} 查看状态。`,
  )
  process.exit(1)
}

console.log('[database] PostgreSQL 已就绪。')
