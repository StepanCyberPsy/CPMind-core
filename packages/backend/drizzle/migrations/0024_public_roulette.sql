DROP INDEX IF EXISTS "uidx_s3_logistic_active_segment";--> statement-breakpoint
DROP INDEX IF EXISTS "uidx_s5_logistic_active_segment";--> statement-breakpoint
DROP INDEX IF EXISTS "uidx_s6_logistic_active_segment";--> statement-breakpoint
ALTER TABLE "ad_sessions" ADD COLUMN "tag_constants_version" text;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "tag_constants_config_id" uuid;--> statement-breakpoint
ALTER TABLE "tag_constants_configs" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ad_sessions" ADD CONSTRAINT "ad_sessions_tag_constants_version_tag_constants_configs_version_fk" FOREIGN KEY ("tag_constants_version") REFERENCES "public"."tag_constants_configs"("version") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "placements" ADD CONSTRAINT "placements_tag_constants_config_id_tag_constants_configs_id_fk" FOREIGN KEY ("tag_constants_config_id") REFERENCES "public"."tag_constants_configs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_placements_tag_constants_config_id" ON "placements" USING btree ("tag_constants_config_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_s3_logistic_active_segment_version" ON "s3_logistic_configs" USING btree ("segment_key","tag_constants_version") WHERE "s3_logistic_configs"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_s5_logistic_active_segment_version" ON "s5_logistic_configs" USING btree ("segment_key","tag_constants_version") WHERE "s5_logistic_configs"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_s6_logistic_active_segment_version" ON "s6_logistic_configs" USING btree ("segment_key","tag_constants_version") WHERE "s6_logistic_configs"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_tag_constants_configs_default" ON "tag_constants_configs" USING btree ("is_default") WHERE "tag_constants_configs"."is_default" = true;