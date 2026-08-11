/// <reference types="@cloudflare/workers-types" />

interface CloudflareEnv {
  DB: D1Database
}

declare module 'cloudflare:workers' {
  export const env: CloudflareEnv
}
