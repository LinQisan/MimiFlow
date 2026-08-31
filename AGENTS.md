<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# MimiFlow project guide

MimiFlow is a local-first language-learning workspace for listening, reading,
exam practice, vocabulary, learning records, scores, and spaced review. The UI
supports Chinese, Japanese, and English content, with Japanese pronunciation and
ruby rendering as first-class concerns.

## Runtime and commands

- Runtime: Node.js 22–26, Next.js 16, React 19, TypeScript, Tailwind CSS 4.
- Data: PostgreSQL through Prisma 7 and the `pg` adapter.
- Japanese analysis: optional local SudachiPy environment in `.venv`.
- Install: `npm install`
- Develop: `npm run dev`
- Validate: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`
- Generate Prisma client: `npm run db:generate`
- Apply the current schema locally: `npm run db:push`
- Establish the performance baseline: `npm run perf:baseline`

`npm run dev` checks the configured local PostgreSQL service before starting.
Never print or commit values from `.env` or `.env.local`.

## Directory map

- `app/`: App Router routes and route-level composition.
  - `(home)`: landing page.
  - `(study)`: listening, practice, shadowing, and review workflows.
  - `(library)`: reading and subtitle libraries and detail readers.
  - `(knowledge)`: vocabulary, wordbooks, grammar, learning points, and scores.
  - `(tools)`: search and utility screens.
  - `(admin)`: content and system management under `/manage`.
  - `api/`: small HTTP boundaries used by interactive clients.
- `components/`: reusable application-wide UI and exam rendering primitives.
- `features/`: feature-oriented UI, hooks, server queries, exports, and actions.
- `modules/`: domain-focused workflows shared by routes and features. Keep domain
  rules in `domain/`, database access in `server/` or `repository.ts`, and writes
  in `actions/`.
  - `questions/domain/` owns reusable editor rules, paper sections, and TOEIC
    metadata. Import these rules from `modules`, never from a UI feature.
  - `language/domain/` owns shared Japanese analysis types and pure vocabulary
    ranking logic used by reading, listening, practice, and vocabulary.
- `lib/`: infrastructure, codecs, validation, errors, Prisma access, and shared
  repositories. Repositories are the preferred database read boundary.
  Server filesystem roots are centralized in `lib/server/public-paths.ts` so
  Next.js traces exact directories instead of broad `process.cwd()` patterns.
- `context/` and `hooks/`: cross-feature client state and reusable browser hooks.
- `utils/`: deterministic, side-effect-free helpers where possible.
- `prisma/schema.prisma`: the single source of truth for the current database
  structure.
- `scripts/`: database startup, imports, performance checks, and Node test files.
- `public/audios/`: user-managed local audio library. Preserve existing audio
  files and paths unless a request explicitly changes them.
- `.codex-work/` and `outputs/`: local inspection and generated-artifact folders.
  They are ignored and are never application source or commit inputs.

`features/` and `modules/` overlap because the project is being organized
incrementally. For new work, put reusable domain and persistence logic in
`modules/`, feature-specific presentation in `features/`, and keep route files
thin. Do not create another competing layer.

## Architecture and data flow

1. Server route or Server Component reads through a repository/service.
2. Repository/service applies current-user scope and queries Prisma.
3. Data is converted to a serializable view model before reaching Client
   Components.
4. Client mutations call a Server Action or a narrow API route.
5. Mutation boundaries validate input, enforce collection/material compatibility,
   and return the shared serializable action-result contract.

Preferred dependency direction:

`app` / feature UI / shared components → `modules` → `lib` / `utils`

- `app/` owns route composition, metadata, and small HTTP boundaries. It must not
  become a second feature layer.
- `features/` owns feature presentation and route-facing orchestration. Shared
  business rules belong in `modules/`, even when one feature introduced them.
- New `modules/` code must not depend on feature UI or route files. When old
  overlap is encountered, move the shared rule downward rather than adding another
  adapter.
- `lib/` and `utils/` stay presentation-agnostic. `lib/` may perform infrastructure
  work; `utils/` should remain deterministic and side-effect free.

Core content hierarchy:

- `Collection` organizes books, chapters, papers, and related material groups.
- `Material` stores listening, reading, speaking, and vocabulary/grammar content.
- `CollectionMaterial` owns placement and authored ordering.
- `Question` and `QuestionOption` store canonical question data.
- JSON payloads are extensions, not substitutes for canonical columns. Decode and
  normalize them through `lib/codecs` at the boundary.
- Learning state is user-scoped. New reads and writes must use the current user;
  never silently fall back to global learning records.
- Vocabulary organization is deliberately two levels: `WordbookSeries` groups
  leaf `Wordbook` records. Do not recreate a recursive wordbook tree or expose a
  series as if it were a selectable wordbook.

## Database policy

The repository intentionally keeps no historical Prisma migration chain or local
database dumps. The current schema is authoritative.

- Use `npm run db:push` for the local database.
- Keep schema changes and their application code in the same change.
- Do not add `prisma/migrations`, SQL backups, dumps, or one-off migration reports
  unless the user explicitly requests a deployment migration strategy.
- Data repair/import scripts must be idempotent, narrowly named, and retained only
  while they remain an active supported workflow.
- Never overwrite an existing vocabulary audio path during imports unless the
  request explicitly authorizes it.

## Coding conventions

- Read the relevant local Next.js 16 documentation before changing framework APIs.
- Prefer Server Components. Add `'use client'` only at the smallest interactive
  boundary.
- Keep `page.tsx` and `route.ts` files thin. Complex state belongs in a named hook,
  view markup in a feature/module component, and reusable parsing in a domain file.
- Keep render functions pure. Time, randomness, storage, and DOM access belong in
  event handlers, effects, or server boundaries.
- Reuse domain parsers and question helpers; do not implement route-local copies.
- Preserve authored order explicitly. Never rely on database return order.
- Keep Japanese text normalization Unicode-aware and preserve ruby, footnotes,
  sorting slots, cloze anchors, and source numbering.
- Use `server-only` in modules that import Prisma or privileged server services.
- Use `@/` imports across layers and relative imports only within a tightly related
  folder.
- Prefer small named functions over large inline branches. Remove obsolete adapters
  and exports once all callers have moved.
- Start independent server reads together with `Promise.all`. For large datasets,
  filter, project, aggregate, and paginate in PostgreSQL before building view models.
  Bulk imports must pre-index reference data and batch association writes instead
  of scanning the full dataset or issuing tag/link queries inside each row loop.
- Persistent Next.js caches for mutable database content require an explicit,
  audited invalidation path from every relevant write. Otherwise use request-local
  React `cache` only for render deduplication, or read the database directly.
- Large interactive entry points may coordinate state, but new self-contained
  controls and panels must be extracted into their feature/module `components/`
  folder. Do not add another large inline popover to an already large route client.
- Follow the visual rules in `DESIGN.md`; reuse existing `ui-*`, editorial, and
  language typography utilities before adding new global styles.
- Use `CustomSelect` for styled application dropdowns and `DatePicker` for dates.
  The shared date picker supports both direct typing and calendar selection.
- Japanese pronunciation for practice, reading, listening, and vocabulary uses
  the shared `/api/pronunciation` boundary, `modules/language` domain types, and
  the source selector in `components/ui`. Do not create a route-specific copy.

## Verification expectations

- Pure domain changes require focused, behavior-oriented Node tests in
  `scripts/*.test.mjs`. Prefer testing inputs, outputs, ordering, validation, and
  authorization boundaries over matching implementation strings.
- Route, schema, or shared UI changes require typecheck and lint.
- Before committing a broad change, run the full test suite and production build.
- Treat build warnings about broad filesystem tracing as performance work to fix,
  not as harmless permanent output.
- Do not enforce component architecture with brittle rules such as banning every
  local `useState` or asserting private helper names. Typecheck, lint, boundary
  tests, and narrow domain tests should protect the intended contract.
- Preserve unrelated working-tree changes. Never reset or replace user data to make
  a check pass.
