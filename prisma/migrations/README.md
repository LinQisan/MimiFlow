# Database migrations

`20260809000000_baseline` was generated from the existing PostgreSQL database on
2026-08-09. It intentionally preserves legacy tables, columns, enums, and custom
indexes that still exist in that database, even when the current Prisma client no
longer exposes them.

The baseline must be marked as applied on that existing database before deploying
later migrations:

```sh
npx prisma migrate resolve --applied 20260809000000_baseline
npx prisma migrate deploy
```

New or empty databases should run `npx prisma migrate deploy` normally. Removing
legacy database objects requires a separate, backed-up data-retention decision and
must not be folded into an unrelated migration.
