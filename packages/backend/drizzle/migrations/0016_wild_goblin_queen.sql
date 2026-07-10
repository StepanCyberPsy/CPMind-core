CREATE TABLE IF NOT EXISTS "s7_quantile_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_type" text NOT NULL,
	"relative_y_low" real NOT NULL,
	"relative_y_mid" real NOT NULL,
	"clutter_mid" real NOT NULL,
	"clutter_high" real NOT NULL,
	"sample_size" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"deletion_scheduled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "s7_model_version" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_s7_quantile_active_device" ON "s7_quantile_configs" USING btree ("device_type") WHERE "s7_quantile_configs"."is_active" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_s7_quantile_deletion_scheduled_at" ON "s7_quantile_configs" USING btree ("deletion_scheduled_at");