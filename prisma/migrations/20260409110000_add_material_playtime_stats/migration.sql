CREATE TABLE "material_playtime_stats" (
  "id" TEXT NOT NULL,
  "profile_id" TEXT NOT NULL DEFAULT 'default',
  "material_id" TEXT NOT NULL,
  "total_seconds" INTEGER NOT NULL DEFAULT 0,
  "played_days" INTEGER NOT NULL DEFAULT 0,
  "last_played_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "material_playtime_stats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "material_playtime_stats_profile_id_material_id_key"
  ON "material_playtime_stats"("profile_id", "material_id");

CREATE INDEX "material_playtime_stats_material_id_updated_at_idx"
  ON "material_playtime_stats"("material_id", "updated_at");

ALTER TABLE "material_playtime_stats"
  ADD CONSTRAINT "material_playtime_stats_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "GameProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "material_playtime_stats"
  ADD CONSTRAINT "material_playtime_stats_material_id_fkey"
  FOREIGN KEY ("material_id") REFERENCES "materials"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
