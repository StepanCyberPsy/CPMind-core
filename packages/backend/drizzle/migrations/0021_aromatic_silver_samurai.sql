DROP INDEX IF EXISTS "idx_cpj_status_available";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_cpj_locked_at";--> statement-breakpoint
ALTER TABLE "creative_processing_jobs" ADD COLUMN "creative_version_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_processing_jobs" ADD COLUMN "processing_profile_version" text NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_processing_jobs" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "creative_processing_jobs" ADD COLUMN "heartbeat_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creative_processing_jobs" ADD CONSTRAINT "creative_processing_jobs_creative_version_id_creative_versions_id_fk" FOREIGN KEY ("creative_version_id") REFERENCES "public"."creative_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_cpj_creative_version_id" ON "creative_processing_jobs" USING btree ("creative_version_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cpj_pending_available" ON "creative_processing_jobs" USING btree ("available_at","created_at") WHERE "creative_processing_jobs"."status" = 'pending';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cpj_processing_lease_expires_at" ON "creative_processing_jobs" USING btree ("lease_expires_at") WHERE "creative_processing_jobs"."status" = 'processing' AND "creative_processing_jobs"."lease_expires_at" IS NOT NULL;