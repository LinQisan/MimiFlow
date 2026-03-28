// prisma.config.ts
import { defineConfig } from '@prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // 明确告诉 Prisma 7，数据库建在哪里
    url: 'file:./prisma/dev.db',
  },
})
