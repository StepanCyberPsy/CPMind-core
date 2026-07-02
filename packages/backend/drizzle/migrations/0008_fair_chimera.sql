ALTER TABLE "impressions" ADD COLUMN "s6_raw_completion_rate" real;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "s6_normalized" real;--> statement-breakpoint
ALTER TABLE "weight_configs" ADD COLUMN "config_type" text DEFAULT 'banner' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_impressions_s6_normalized" ON "impressions" USING btree ("s6_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_weight_configs_active_type" ON "weight_configs" USING btree ("config_type") WHERE "weight_configs"."is_active" = true;
UPDATE weight_configs SET config_type = 'banner' WHERE config_type IS NULL;