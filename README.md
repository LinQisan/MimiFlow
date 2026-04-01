# MimiFlow

MimiFlow is a language-learning web app built around a complete study loop:
**listening -> reading -> quizzes -> vocabulary -> review**.
It provides a unified menu system, multilingual UI, and a management workspace for content operations.

## Core Features

- Listening (`/lessons/[id]`)
- Sentence-level audio playback and loop training
- Tap-to-save words from sentence context
- Inline word panel with pronunciation, meanings, and POS metadata

- Reading (`/articles/[id]`)
- Integrated reading + question workflow
- Word selection with source back-links
- Toggle switches for pronunciation and meanings

- Quizzes (`/quizzes/[id]`)
- Multiple quiz modes and final submission workflow
- Word capture from question context

- Vocabulary (`/vocabulary`)
- Language/folder organization
- List view and flashcard view
- Multi-value metadata support:
  - `pronunciations`
  - `partsOfSpeech`
  - `meanings`
- Example sentence links with source navigation

- Review (`/review`)
- FSRS-based sentence review scheduling

- Management (`/manage/*`)
- Upload and maintain listening/reading/quiz content
- Audio file management (move/rename/bulk actions)
- Vocabulary maintenance

## Tech Stack

- Next.js (App Router)
- React + TypeScript
- Tailwind CSS
- Prisma + SQLite (`prisma/dev.db`)
- FSRS (review scheduler)

## Quick Start

1. Install dependencies

```bash
npm install
```

2. Generate Prisma client

```bash
npx prisma generate
```

3. Apply schema to local SQLite

```bash
npx prisma db push
```

4. Start dev server

```bash
npm run dev
```

5. Type-check

```bash
npx tsc --noEmit
```

## Project Structure

```text
app/            # Routes and pages
components/     # Shared UI components
context/        # Global providers (dialog, i18n)
hooks/          # Shared hooks
prisma/         # Schema, migrations, local sqlite db
utils/          # Utility modules
```

## Notes

- This repository currently includes a local SQLite DB and static assets for local development/demo.
- For production, separate database and static file strategy is recommended.

## Translations

- Chinese: [README.zh-CN.md](./README.zh-CN.md)
- Japanese: [README.ja.md](./README.ja.md)
