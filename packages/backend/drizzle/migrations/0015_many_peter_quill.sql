CREATE TABLE IF NOT EXISTS "s6_logistic_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"segment_key" text NOT NULL,
	"tag_constants_version" text NOT NULL,
	"coefficients" jsonb NOT NULL,
	"feature_means" jsonb NOT NULL,
	"feature_stds" jsonb NOT NULL,
	"sample_size" integer NOT NULL,
	"accuracy" real,
	"fitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"deletion_scheduled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "s6_model_version" text;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "s6_completion_rate_pct" real;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "s6_audible_time_sec" real;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "s6_duration_sec" real;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "s6_skippable" boolean;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_s6_logistic_active_segment" ON "s6_logistic_configs" USING btree ("segment_key") WHERE "s6_logistic_configs"."is_active" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_s6_logistic_deletion_scheduled_at" ON "s6_logistic_configs" USING btree ("deletion_scheduled_at");