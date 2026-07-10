CREATE TABLE IF NOT EXISTS "s1_weibull_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"segment_key" text NOT NULL,
	"k" real NOT NULL,
	"lambda" real NOT NULL,
	"sample_size" integer NOT NULL,
	"fitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"deletion_scheduled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "s1_model_version" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_s1_weibull_active_segment" ON "s1_weibull_configs" USING btree ("segment_key") WHERE "s1_weibull_configs"."is_active" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_s1_weibull_deletion_scheduled_at" ON "s1_weibull_configs" USING btree ("deletion_scheduled_at");