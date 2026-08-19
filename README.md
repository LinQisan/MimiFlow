# MimiFlow

MimiFlow is a language-learning app for listening, shadowing, reading, quizzes, vocabulary, and spaced review.

## Features

- Listening and shadowing with sentence-level playback and vocabulary notes
- Reading, subtitle study, and inline vocabulary capture
- Practice papers with variable option counts and wrong-answer review
- Vocabulary notebooks and FSRS-based memory review
- Management tools for content, audio, collections, and imports

## Stack

Next.js 16, React 19, TypeScript, Tailwind CSS, Prisma, PostgreSQL, and ts-fsrs.

## Local Development

Requirements: Node.js 22–24 and PostgreSQL.

```bash
npm install
npm run db:generate
npm run db:push
npm run dev
```

Set `DATABASE_URL` in `.env.local` before running database commands.
On macOS with Homebrew PostgreSQL, `npm run dev` checks the local database and
starts its Homebrew service when needed. If multiple PostgreSQL versions are
installed, set `POSTGRES_SERVICE` in `.env.local` (for example, `postgresql@16`).

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Main Routes

- `/listening`, `/reading`, `/subtitles`, `/practice`
- `/vocabulary`, `/review`
- `/manage` for content administration

## Languages

- [简体中文](./README.zh-CN.md)
- [日本語](./README.ja.md)
