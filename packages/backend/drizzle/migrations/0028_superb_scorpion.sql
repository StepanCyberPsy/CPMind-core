ALTER TABLE "impressions" ADD COLUMN "sdk_runtime_version" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_impressions_creative_type" ON "impressions" USING btree ("creative_type");