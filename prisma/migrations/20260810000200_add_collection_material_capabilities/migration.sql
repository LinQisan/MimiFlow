-- CollectionType describes structure (paper, book, chapter), while this field
-- describes which material shapes a collection is intended to accept.
ALTER TABLE "public"."collections"
  ADD COLUMN "accepted_material_types" "MaterialType"[] NOT NULL
  DEFAULT ARRAY[]::"MaterialType"[];

-- Preserve the established material purpose of populated collections.
UPDATE "public"."collections" AS collection
SET "accepted_material_types" = material_types.types
FROM (
  SELECT
    collection_id,
    array_agg(DISTINCT material.type)::"MaterialType"[] AS types
  FROM "public"."collection_materials" AS link
  JOIN "public"."materials" AS material ON material.id = link.material_id
  GROUP BY collection_id
) AS material_types
WHERE collection.id = material_types.collection_id;

-- A book inherits the material purposes already present in its chapters.
UPDATE "public"."collections" AS book
SET "accepted_material_types" = child_types.types
FROM (
  SELECT
    parent.id AS book_id,
    array_agg(DISTINCT material.type)::"MaterialType"[] AS types
  FROM "public"."collections" AS parent
  JOIN "public"."collections" AS child ON child.parent_id = parent.id
  JOIN "public"."collection_materials" AS link ON link.collection_id = child.id
  JOIN "public"."materials" AS material ON material.id = link.material_id
  WHERE parent.collection_type = 'BOOK'
  GROUP BY parent.id
) AS child_types
WHERE book.id = child_types.book_id;

-- Papers can receive each of their three canonical sections even before a
-- particular section has been imported.
UPDATE "public"."collections"
SET "accepted_material_types" = ARRAY[
  'LISTENING', 'READING', 'VOCAB_GRAMMAR'
]::"MaterialType"[]
WHERE collection_type = 'PAPER';

-- 天声人语 is one editorial series with two study surfaces: the original
-- article and its synchronized shadowing material.
UPDATE "public"."collections"
SET "accepted_material_types" = ARRAY['READING', 'SPEAKING']::"MaterialType"[]
WHERE collection_type = 'BOOK' AND title = '天声人语';
