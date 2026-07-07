CREATE TABLE IF NOT EXISTS "ivt_list_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"entries" jsonb NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"entries_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ivt_list_configs_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ivt_thresholds_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"thresholds" jsonb NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ivt_thresholds_configs_version_unique" UNIQUE("version")
);
--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "ivt_verdict" text DEFAULT 'valid' NOT NULL;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "ivt_category" text;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "ivt_confidence" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "score_reliable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "fp_hash" text;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "ivt_signals" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_ivt_list_active" ON "ivt_list_configs" USING btree ("is_active") WHERE "ivt_list_configs"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_ivt_thresholds_active" ON "ivt_thresholds_configs" USING btree ("is_active") WHERE "ivt_thresholds_configs"."is_active" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_impressions_ivt_verdict" ON "impressions" USING btree ("ivt_verdict");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_impressions_fp_hash" ON "impressions" USING btree ("fp_hash");
ALTER TABLE "impressions" ADD CONSTRAINT "chk_ivt_verdict_valid"
  CHECK (ivt_verdict IN ('valid', 'givt', 'sivt_suspected', 'sivt_confirmed'))