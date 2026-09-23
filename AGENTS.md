# Testing principles

* NEVER write unit tests after you write code.
* Highly prefer E2E tests as the sole testing mechanism. Use them to verify complex features work. At the end of E2E tests, produce a verifiable and repeatable artifact.
* If you must test a system in isolation, FIRST write all the ways it could fail, THEN write the code.
* When writing E2E tests, choose a medium-to-hard scenario rather than the simplest possible scenario.
* During development, do not run the full E2E suite; run it at the end.

# MimiFlow constraints

## Architecture

* Put new shared domain and persistence logic in `modules/`. Do not introduce dependencies from `modules/` to feature UI/routes or create new bridging layers. Existing exceptions are not precedent.
* Reuse existing shared implementations:

  * `modules/questions/domain` for editor and paper rules
  * `lib/codecs` for payload normalization
  * `lib/actions/result.ts` for mutation results
* JSON may extend canonical database columns but must not duplicate or replace them.
* Keep Japanese analysis in `modules/language`. Reuse the shared `/api/pronunciation` APIs and `usePronunciationSource`; do not create screen-specific pronunciation implementations.
* Text transformations must preserve ruby, footnotes, sorting slots, cloze anchors, source numbering, and authored order.
* Follow `DESIGN.md` and existing shared controls/typography for UI changes.

## Data invariants

* Learning state and vocabulary organization are always scoped to the current user. Preserve this scope in reads, writes, caches, and cache keys; never fall back to global records.
* `WordbookSeries` groups leaf `Wordbook` records. Do not recreate a recursive wordbook tree or treat a series as a leaf.
* Preserve authored ordering, including `CollectionMaterial` placement order, and validate collection/material compatibility on writes.
* `prisma/schema.prisma` is authoritative. For local development, apply schema changes with `npm run db:push`. Do not create migrations, SQL dumps, backups, or migration reports unless the task explicitly requires a deployment migration strategy.
* Preserve user-managed files and paths under `public/audios/`. Do not overwrite existing vocabulary audio paths unless the task explicitly requires it. Import and repair scripts must be idempotent.
* Persistent caches over mutable database data require invalidation from every relevant write. Otherwise use request-local React `cache` or direct reads.
* Bulk operations must avoid per-row tag/link/association queries when they can be batched.
* Use `lib/server/public-paths.ts` for server-side public-file roots. Do not introduce broad `process.cwd()` filesystem tracing.

## Verification

* Prefer E2E tests as the sole testing mechanism, using medium-to-hard scenarios and producing a verifiable, repeatable artifact. If isolated testing is necessary, document all ways the system could fail before writing the code.
* For route, schema, or shared UI changes, run:

  * `npm run typecheck`
  * `npm run lint`
* Before committing broad changes, also run:

  * `npm test`
  * `npm run build`
* Never reset, replace, or modify user data merely to make verification pass.
* Never print or commit `.env` values.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
