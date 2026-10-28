ALTER TABLE "ad_sessions" ADD COLUMN "omid_verification_not_executed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ad_sessions" ADD COLUMN "omid_not_executed_reason" text;