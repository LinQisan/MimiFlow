# Nadeshiko examples

Set `NADESHIKO_API_KEY` in the server environment and restart Next.js. The key is
checked only inside a user-triggered search/add operation. No search runs on SSR,
hover, or initial page load. A missing key is a local, recoverable UI state.

API contract: [official generated public types](https://github.com/BrigadaSOS/nadeshiko-sdk-ts/blob/main/generated/public/types.gen.ts),
checked on 2026-09-08. Search uses `Segment.publicId` and
`includes.media[mediaPublicId].nameJa`, not the older README example's
`segmentPublicId`. The API has no segment source-page URL field; the app builds
the site's `/sentence/{publicId}` permalink.

Successful search results are cached for six hours, isolated by a hash of the
server API credential. Errors and user-specific `isAdded` membership are never
cached. Add accepts only validated references plus an optional owned sense ID,
and resolves content on the server (a cache miss may renew the search).

`VocabularySentence.provider + externalId` identifies a shared clip;
`VocabularySentenceLink.vocabularyId + sentenceId` identifies its attachment to a
user-owned word. Existing text, translation, audio and source columns remain
canonical. `sourceMetadata` holds media ID/titles, episode, start/end milliseconds,
image and video URLs. No media is downloaded or mirrored. Sudachi materialization
and the existing sentence renderer/audio controls handle saved examples.

The additive migration `20260908010000_add_sentence_external_source` preserves
existing rows. Apply it with `prisma migrate deploy` to the existing project
database. The repository does not contain its historical baseline migrations;
this migration alone is not a fresh-database bootstrap. Do not reset existing data
or recreate old migrations to apply it.

Offline checks: `node --test scripts/nadeshiko-examples.test.mjs`, Prisma validate,
typecheck, lint and build. No live Nadeshiko request or test API key is required.
