ALTER TABLE "ad_sessions" ADD COLUMN "format" text;--> statement-breakpoint
ALTER TABLE "ad_sessions" ADD COLUMN "subtype" text;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "format" text;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "subtype" text;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "format" text;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "subtype" text;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "sticky_corner" text;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "sticky_offset_x" integer;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "sticky_offset_y" integer;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "sticky_width" integer;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "sticky_height" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_impressions_format_subtype" ON "impressions" USING btree ("format","subtype") WHERE "impressions"."format" IS NOT NULL;
--> statement-breakpoint
UPDATE "placements" SET
  "format" = CASE
    WHEN "mode" = 'display' THEN 'banner'
    WHEN "mode" IN ('instream_preroll', 'instream_midroll', 'instream_postroll') THEN 'instream'
    ELSE 'outstream'
  END,
  "subtype" = CASE
    WHEN "mode" = 'display' THEN NULL
    WHEN "mode" = 'instream_preroll' THEN 'preroll'
    WHEN "mode" = 'instream_midroll' THEN 'midroll'
    WHEN "mode" = 'instream_postroll' THEN 'postroll'
    ELSE 'inpage'
  END;--> statement-breakpoint
UPDATE "ad_sessions" SET
  "format" = CASE
    WHEN "delivery_mode" = 'display' THEN 'banner'
    WHEN "delivery_mode" IN ('instream_preroll', 'instream_midroll', 'instream_postroll') THEN 'instream'
    ELSE 'outstream'
  END,
  "subtype" = CASE
    WHEN "delivery_mode" = 'display' THEN NULL
    WHEN "delivery_mode" = 'instream_preroll' THEN 'preroll'
    WHEN "delivery_mode" = 'instream_midroll' THEN 'midroll'
    WHEN "delivery_mode" = 'instream_postroll' THEN 'postroll'
    ELSE 'inpage'
  END;--> statement-breakpoint
UPDATE "impressions" SET
  "format" = CASE
    WHEN "delivery_mode" = 'display' THEN 'banner'
    WHEN "delivery_mode" IN ('instream_preroll', 'instream_midroll', 'instream_postroll') THEN 'instream'
    ELSE 'outstream'
  END,
  "subtype" = CASE
    WHEN "delivery_mode" = 'display' THEN NULL
    WHEN "delivery_mode" = 'instream_preroll' THEN 'preroll'
    WHEN "delivery_mode" = 'instream_midroll' THEN 'midroll'
    WHEN "delivery_mode" = 'instream_postroll' THEN 'postroll'
    ELSE 'inpage'
  END
WHERE "delivery_mode" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "chk_placements_format_subtype" CHECK (
  ("format" IS NULL AND "subtype" IS NULL)
  OR ("format" = 'banner' AND "subtype" IS NULL)
  OR ("format" = 'instream' AND "subtype" IN ('preroll', 'midroll', 'postroll', 'pauseroll'))
  OR ("format" = 'outstream' AND "subtype" IN ('inpage', 'sticky'))
);--> statement-breakpoint
ALTER TABLE "ad_sessions" ADD CONSTRAINT "chk_ad_sessions_format_subtype" CHECK (
  ("format" IS NULL AND "subtype" IS NULL)
  OR ("format" = 'banner' AND "subtype" IS NULL)
  OR ("format" = 'instream' AND "subtype" IN ('preroll', 'midroll', 'postroll', 'pauseroll'))
  OR ("format" = 'outstream' AND "subtype" IN ('inpage', 'sticky'))
);--> statement-breakpoint
ALTER TABLE "impressions" ADD CONSTRAINT "chk_impressions_format_subtype" CHECK (
  ("format" IS NULL AND "subtype" IS NULL)
  OR ("format" = 'banner' AND "subtype" IS NULL)
  OR ("format" = 'instream' AND "subtype" IN ('preroll', 'midroll', 'postroll', 'pauseroll'))
  OR ("format" = 'outstream' AND "subtype" IN ('inpage', 'sticky'))
);--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "chk_placements_sticky_corner" CHECK (
  "sticky_corner" IS NULL
  OR "sticky_corner" IN ('top_left', 'top_right', 'bottom_left', 'bottom_right')
);