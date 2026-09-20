# MimiFlow

Language learning with listening, shadowing, reading, quizzes, vocabulary notebooks, and FSRS spaced review.

Next.js 16 · React 19 · TypeScript · Tailwind CSS · Prisma · PostgreSQL

[简体中文](README.zh-CN.md) · [日本語](README.ja.md)

## Development

Requires Node.js 22–26, Python 3, and PostgreSQL. Set `DATABASE_URL` in `.env.local`, then run:

```sh
npm ci
npm run sudachi:setup
npm run db:push
npm run dev
```

Open [localhost:3000](http://localhost:3000). Content management is at `/manage`.
`npm ci` generates the Prisma client; after schema edits run `npm run db:generate` and `npm run db:push`.
Sudachi provides Japanese text analysis; use `SUDACHI_PYTHON` for an existing Python environment.
On macOS, development startup can start Homebrew PostgreSQL; set `POSTGRES_SERVICE` if multiple versions are installed.

## Structure

- `app/`: pages, layouts, and API routes
- `modules/`: business domains, services, hooks, and feature UI
- `components/`, `context/`, `hooks/`: shared UI and application state
- `lib/`, `utils/`: infrastructure, codecs, existing repositories, and utilities
- `prisma/`: database schema; `scripts/`: tests and maintenance tools

Keep new domain and persistence logic in `modules/`. See [AGENTS.md](AGENTS.md) for engineering rules and [DESIGN.md](DESIGN.md) for UI conventions.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
```
