DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "public"."collections" AS collection
    WHERE collection."collection_type" = 'FAVORITES'
      AND (
        EXISTS (
          SELECT 1
          FROM "public"."collection_materials" AS material_link
          WHERE material_link."collection_id" = collection."id"
        )
        OR EXISTS (
          SELECT 1
          FROM "public"."collections" AS child
          WHERE child."parent_id" = collection."id"
        )
      )
  ) THEN
    RAISE EXCEPTION 'Cannot remove FAVORITES collections that still contain materials or children';
  END IF;
END $$;

DELETE FROM "public"."collections"
WHERE "collection_type" = 'FAVORITES';

ALTER TYPE "public"."CollectionType" RENAME TO "CollectionType_old";
CREATE TYPE "public"."CollectionType" AS ENUM (
  'PAPER',
  'CUSTOM_GROUP',
  'LIBRARY_ROOT',
  'BOOK',
  'CHAPTER'
);
ALTER TABLE "public"."collections"
  ALTER COLUMN "collection_type" TYPE "public"."CollectionType"
  USING ("collection_type"::text::"public"."CollectionType");
DROP TYPE "public"."CollectionType_old";
