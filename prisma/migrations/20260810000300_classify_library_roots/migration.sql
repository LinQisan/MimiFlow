-- Library roots describe navigation purpose, not every capability of their
-- descendants. A mixed book can therefore appear in another import surface
-- without making its original root selectable there.
UPDATE "public"."collections"
SET "accepted_material_types" = ARRAY['SPEAKING']::"MaterialType"[]
WHERE collection_type = 'LIBRARY_ROOT' AND title IN ('口语', '跟读');

UPDATE "public"."collections"
SET "accepted_material_types" = ARRAY['READING']::"MaterialType"[]
WHERE collection_type = 'LIBRARY_ROOT' AND title = '阅读';

UPDATE "public"."collections"
SET "accepted_material_types" = ARRAY['LISTENING']::"MaterialType"[]
WHERE collection_type = 'LIBRARY_ROOT' AND title = '听力';
