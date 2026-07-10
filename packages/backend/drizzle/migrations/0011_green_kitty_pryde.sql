CREATE TABLE IF NOT EXISTS "s3_logistic_configs" (
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
ALTER TABLE "impressions" ADD COLUMN "s3_model_version" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_s3_logistic_active_segment" ON "s3_logistic_configs" USING btree ("segment_key") WHERE "s3_logistic_configs"."is_active" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_s3_logistic_deletion_scheduled_at" ON "s3_logistic_configs" USING btree ("deletion_scheduled_at");