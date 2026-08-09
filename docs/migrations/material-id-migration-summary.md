# Material ID migration — 2026-08-10

The migration completed successfully against the current database.

- Materials audited: 91
- IDs changed to canonical UUIDs: 89
- Materials now using UUIDs: 91 / 91
- `questions.content` rows cleaned: 115
- Material legacy metadata rows removed: 87
- `Vocabulary.sourceId` rows rewritten: 99
- `VocabularySentence.sourceId` rows rewritten: 80
- `VocabularySentence.sourceUrl` rows rewritten: 23
- `SentenceReview.sourceId` rows rewritten: 0
- Legacy numeric dialogue source rows resolved: 93 / 93

The complete reversible old-ID-to-UUID mapping is stored in
`material-id-migration-report.json`. Future writes are protected by database
constraints requiring canonical UUID material IDs and extension-only question
content. Dialogue-backed vocabulary and review records are additionally constrained
to the scoped `materialUUID::lineKey` format.
