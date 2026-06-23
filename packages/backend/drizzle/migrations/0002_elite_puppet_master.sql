ALTER TABLE "impressions" ADD COLUMN "session_group_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "segment_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_session_group_id" ON "impressions" USING btree ("session_group_id");