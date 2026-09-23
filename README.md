# MimiFlow

Language learning with listening, shadowing, reading, quizzes, vocabulary notebooks, and FSRS spaced review.

Next.js 16 · React 19 · TypeScript · Tailwind CSS · Prisma · PostgreSQL

[简体中文](README.zh-CN.md) · [日本語](README.ja.md)

## Development

Requires Node.js 22–26, Rust 1.88+, and PostgreSQL. Set `DATABASE_URL` in `.env.local`, then run:

```sh
npm ci
npm run db:push
npm run dev
```

Open [localhost:3000](http://localhost:3000). Content management is at `/manage`.
Email and password are required to sign in. Registration supports `REGISTRATION_MODE=disabled|invite|open`; see [account registration and SMTP setup](docs/registration.md). New accounts are non-admin by default and cannot enter `/manage`. Existing profiles can be linked by exact user ID with `npm run user:claim -- <user-id> <email>` and `MIMIFLOW_CLAIM_PASSWORD`.
Wordbooks and their entries are shared learning content maintained by administrators. Words outside wordbooks, vocabulary review cards, and question attempts remain account-specific.
`npm ci` generates the Prisma client; after schema edits run `npm run db:generate` and `npm run db:push`.
Sudachi runs in-process through a Rust Node-API addon. `npm ci` builds it and installs the pinned full dictionary; see [native setup](modules/language/native/README.md).
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

`npm test` builds the app and runs a two-account browser flow against a disposable local PostgreSQL database. It saves a screenshot and result in `outputs/e2e/`. See the [testing guide](docs/testing.md) for prerequisites.
