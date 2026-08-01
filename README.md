# MimiFlow

MimiFlow is a language-learning web app built as one continuous acquisition loop:
**input -> retrieval -> interleaving -> output -> spaced review**.

The project supports listening, reading, quizzes, vocabulary, FSRS memory review, and scheduled wrong-answer practice.

## Product Highlights

- Unified navigation and multilingual interface (`zh`, `ja`, `en`)
- Listening and reading workflows with inline vocabulary capture
- Quiz engine with article cloze integration and answer-state rendering
- Vocabulary notebook with pronunciation, meanings, POS, sentence links, and flashcards
- Retry queue for wrong answers (`24h -> 72h -> 7d`)
- FSRS profile + review event logging + admin snapshot panel
- Review center with separate FSRS memory and wrong-answer queues

## Core Routes

- Study
  - `/listening` listening library; `/listening/[id]` listening and shadowing
  - `/reading` reading library; `/reading/articles/[id]` article reading
  - `/subtitles/[id]` subtitle-based media study
  - `/practice` exam practice
  - `/review` review center
  - `/review/memory` FSRS vocabulary and sentence review
  - `/review/mistakes` scheduled wrong-answer practice
  - `/vocabulary` vocabulary notebook
- Management
  - `/manage` operations entry
  - `/manage/import` unified import center
  - `/manage/listening` listening maintenance
  - `/manage/practice` paper maintenance
  - `/manage/import?type=anki` Anki importer with preview
  - `/manage/system/audio` site audio file manager
  - `/manage/system/review` FSRS profile monitor panel

## SLA-Oriented Acquisition Design

- Morning: comprehensible input + retrieval cycle
- Afternoon: interleaving (review + quizzes + listening/reading)
- Any time: due FSRS memory review and scheduled wrong-answer practice

## Tech Stack

- Next.js (App Router)
- React + TypeScript
- Tailwind CSS
- Prisma + PostgreSQL
- FSRS scheduling

## Local Setup

1. Install dependencies

```bash
npm install
```

2. Configure environment

```bash
cp .env.example .env
# then edit DATABASE_URL to your PostgreSQL instance
```

3. Generate Prisma Client

```bash
npm run db:generate
```

4. Sync schema to PostgreSQL

```bash
npm run db:push
```

5. Start development server

```bash
npm run dev
```

6. Quality checks

```bash
npm run typecheck
npm run lint
```

## Project Structure

```text
app/          routes + server actions
components/   shared UI
context/      global providers
hooks/        telemetry/prefs hooks
modules/      feature-oriented review, practice, and progress code
prisma/       schema + local db
utils/        text/linguistic helpers
```

## Notes

- Use managed PostgreSQL/storage and proper secrets in production.

## Other Languages

- 中文: [README.zh-CN.md](./README.zh-CN.md)
- 日本語: [README.ja.md](./README.ja.md)
