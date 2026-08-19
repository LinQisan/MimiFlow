# Legacy data archive migration — 2026-08-20

Migration `20260820000100_archive_legacy_learning_data` reconciles the active
Prisma schema with the local PostgreSQL database without discarding historical
learning data.

## Preserved data

- The pre-consolidation Prisma migration rows are copied to
  `archive.prisma_migrations_legacy` before being removed from the active
  `_prisma_migrations` ledger.
- `GameSessionLog`, `LearningDiary`, `MorningRecall`, `OutputPractice`, and
  `VocabularyFolder` are moved intact from `public` to `archive`.
- Deprecated `GameProfile` fields are copied to
  `archive.game_profile_legacy`.
- Deprecated vocabulary `groupName` and `folderId` values are copied to
  `archive.vocabulary_legacy_classification`.

## Active-model migration

Each non-empty legacy vocabulary group becomes a child of the `旧词汇分组`
wordbook. Membership is copied to `wordbook_vocabularies` and verified inside
the same transaction before the old columns are removed.

## Local recovery point

Before applying the migration, a verified custom-format PostgreSQL dump was
created at:

`.local-backups/mimiflow-before-legacy-archive-20260820.dump`

The directory is intentionally ignored by Git because the dump contains local
user data. Restore it with `pg_restore` if a full rollback is ever required.

Backup SHA-256:

`3e1066e3fb9286c1a5e6001ead3223aa4214800ef62f964e2bf21a42bf67e713`

## Applied-data verification

After deployment, Prisma reports 22 repository migrations and no schema
difference. The archive contains 14 historical migration rows, 15 game session
logs, 2 learning diaries, 1 morning recall, 2 output practices, and the legacy
game profile snapshot. All 116 deprecated vocabulary classifications have both
an archive snapshot and an active wordbook membership.
