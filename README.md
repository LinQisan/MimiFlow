# MimiFlow

MimiFlow is a language-learning web app built as one continuous acquisition loop:
**input -> retrieval -> interleaving -> output -> spaced review**.

The project supports listening, reading, quizzes, vocabulary, FSRS review, and an automated game/task system with AI-assisted output evaluation.

## Product Highlights

- Unified navigation and multilingual interface (`zh`, `ja`, `en`)
- Listening and reading workflows with inline vocabulary capture
- Quiz engine with article cloze integration and answer-state rendering
- Vocabulary notebook with pronunciation, meanings, POS, sentence links, and flashcards
- Retry queue for wrong answers (`24h -> 72h -> 7d`)
- FSRS profile + review event logging + admin snapshot panel
- AI output loop:
  - prompt 1: generate daily writing mission
  - prompt 2: evaluate learner output in strict JSON
  - system parses scores and auto-quantifies progress

## Core Routes

- Study
  - `/lessons/[id]` listening and shadowing
  - `/articles/[id]` reading + embedded questions
  - `/quizzes/[id]` standalone quiz practice
  - `/review` FSRS review
  - `/retry` wrong-answer return queue
  - `/vocabulary` vocabulary notebook
  - `/game` game dashboard and automated daily loop
  - `/today` auto-arranged daily study plan
- Management
  - `/manage` operations entry
  - `/manage/upload` unified upload center
  - `/manage/audio` site audio file manager
  - `/manage/level/*` level/category/content maintenance
  - `/manage/import/anki` Anki importer with preview
  - `/manage/fsrs` FSRS profile monitor panel

## SLA-Oriented Acquisition Design

- Morning: comprehensible input + retrieval cycle
- Afternoon: interleaving (review + quizzes + listening/reading)
- Evening: output with AI coaching and quantified feedback
- Night: lightweight replay
- Next morning: delayed recall dictation

All key tasks are auto-submitted or quantifiable from telemetry/data logs to reduce manual burden.

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
npx tsc --noEmit
npm run lint
```

## AI Output Workflow (In-App)

In `/game`, the output task provides two templates:

1. **Mission prompt** for AI to generate a writing mission
2. **Coach prompt** for AI to grade learner text and return strict JSON metrics

The app ingests the JSON and stores:
- total score
- comprehensibility
- accuracy
- complexity
- task completion
- summary and action items

These metrics directly feed the game progress.

## Project Structure

```text
app/          routes + server actions
components/   shared UI
context/      global providers
hooks/        telemetry/prefs hooks
prisma/       schema + migrations + local db
utils/        text/linguistic helpers
```

## Notes

- Use managed PostgreSQL/storage and proper secrets in production.

## Other Languages

- 中文: [README.zh-CN.md](./README.zh-CN.md)
- 日本語: [README.ja.md](./README.ja.md)
