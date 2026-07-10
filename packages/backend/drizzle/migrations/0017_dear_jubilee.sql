ALTER TABLE "impressions" ADD COLUMN "publisher_domain" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_impressions_publisher_domain" ON "impressions" USING btree ("publisher_domain");