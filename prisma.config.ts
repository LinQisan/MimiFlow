import dotenv from 'dotenv'

import { defineConfig } from 'prisma/config'

dotenv.config({ path: ['.env.local', '.env'], quiet: true })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL || '',
  },
})
