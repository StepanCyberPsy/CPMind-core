ALTER TABLE "impressions" DROP CONSTRAINT "impressions_ad_session_id_ad_sessions_ad_session_id_fk";
--> statement-breakpoint
ALTER TABLE "ad_sessions" ADD COLUMN "start_muted" boolean;--> statement-breakpoint
ALTER TABLE "ad_sessions" ADD COLUMN "muted_by_browser" boolean;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "context_violations" text[];--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "is_checkpoint" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "impressions" ADD CONSTRAINT "impressions_ad_session_id_ad_sessions_ad_session_id_fk" FOREIGN KEY ("ad_session_id") REFERENCES "public"."ad_sessions"("ad_session_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "impressions" ADD CONSTRAINT "chk_impressions_hosted_ad_session" CHECK ("measurement_mode" = 'legacy_tag' OR "ad_session_id" IS NOT NULL);