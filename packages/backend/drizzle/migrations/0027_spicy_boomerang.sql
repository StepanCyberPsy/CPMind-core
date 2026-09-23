CREATE TABLE IF NOT EXISTS "placement_creative_set" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"placement_id" uuid NOT NULL,
	"creative_id" uuid NOT NULL,
	"weight_pct" real NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_sessions" ADD COLUMN "video_show_index" integer;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "video_show_index" integer;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "rotation_mode" text DEFAULT 'weighted_random' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "placement_creative_set" ADD CONSTRAINT "placement_creative_set_placement_id_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."placements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "placement_creative_set" ADD CONSTRAINT "placement_creative_set_creative_id_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."creatives"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_pcs_placement_creative" ON "placement_creative_set" USING btree ("placement_id","creative_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pcs_placement_order" ON "placement_creative_set" USING btree ("placement_id","display_order");
--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "chk_placements_rotation_mode" CHECK ("rotation_mode" IN ('weighted_random', 'sequential'));--> statement-breakpoint
ALTER TABLE "placement_creative_set" ADD CONSTRAINT "chk_pcs_weight_pct" CHECK ("weight_pct" > 0 AND "weight_pct" <= 100);--> statement-breakpoint
ALTER TABLE "placement_creative_set" ADD CONSTRAINT "chk_pcs_display_order" CHECK ("display_order" >= 0);