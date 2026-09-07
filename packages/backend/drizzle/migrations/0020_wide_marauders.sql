DO $$ BEGIN
 CREATE TYPE "public"."asset_class" AS ENUM('source', 'image', 'animated_image', 'video', 'video_poster', 'html_file', 'svg');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."asset_status" AS ENUM('pending', 'ready', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."autoplay_mode" AS ENUM('autoplay', 'click_to_play');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."autoplay_outcome" AS ENUM('started', 'blocked', 'error');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."campaign_status" AS ENUM('active', 'archived');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."creative_status" AS ENUM('draft', 'processing', 'ready', 'active', 'archived', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."creative_type" AS ENUM('banner_static', 'banner_gif', 'banner_html5', 'video_creative');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."creative_version_status" AS ENUM('draft', 'processing', 'ready', 'archived', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."delivery_mode" AS ENUM('display', 'instream_preroll', 'instream_midroll', 'instream_postroll', 'outstream', 'standalone_video');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."measurement_mode" AS ENUM('full_direct_display', 'full_cpmind_player', 'partial_embedded_iframe', 'vast_only', 'legacy_tag');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."processing_job_status" AS ENUM('pending', 'processing', 'ready', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."upload_status" AS ENUM('created', 'uploading', 'uploaded', 'processing', 'ready', 'failed', 'expired');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ad_sessions" (
	"ad_session_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"placement_id" uuid NOT NULL,
	"creative_version_id" uuid,
	"user_id" bigint NOT NULL,
	"tag_id" bigint,
	"creative_type" "creative_type" NOT NULL,
	"delivery_mode" "delivery_mode" NOT NULL,
	"measurement_mode" "measurement_mode" DEFAULT 'legacy_tag' NOT NULL,
	"publisher_domain" text,
	"player_runtime_version" text,
	"sdk_runtime_version" text,
	"autoplay_requested" boolean,
	"initial_muted" boolean,
	"autoplay_outcome" "autoplay_outcome",
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"asset_load_started_at" timestamp with time zone,
	"creative_ready_at" timestamp with time zone,
	"render_confirmed_at" timestamp with time zone,
	"measurement_started_at" timestamp with time zone,
	"measurement_ended_at" timestamp with time zone,
	"vast_requested_at" timestamp with time zone,
	"vast_impression_at" timestamp with time zone,
	"video_started_at" timestamp with time zone,
	"first_quartile_at" timestamp with time zone,
	"midpoint_at" timestamp with time zone,
	"third_quartile_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"skipped_at" timestamp with time zone,
	"error_at" timestamp with time zone,
	"error_code" text,
	"finalization_reason" text,
	"playback_quality" jsonb,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sha256" char(64) NOT NULL,
	"mime_type" text NOT NULL,
	"extension" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"asset_class" "asset_class" NOT NULL,
	"width" integer,
	"height" integer,
	"duration_sec" real,
	"codec" text,
	"bitrate_bps" bigint,
	"status" "asset_status" DEFAULT 'pending' NOT NULL,
	"processing_profile_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" bigint NOT NULL,
	"campaign_key" text NOT NULL,
	"name" text NOT NULL,
	"status" "campaign_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creative_processing_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upload_session_id" uuid NOT NULL,
	"status" "processing_job_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creative_version_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creative_version_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"role" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creative_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"creative_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"source_asset_id" uuid,
	"status" "creative_version_status" DEFAULT 'draft' NOT NULL,
	"processing_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" bigint NOT NULL,
	"campaign_id" uuid NOT NULL,
	"creative_key" text NOT NULL,
	"creative_type" "creative_type" NOT NULL,
	"name" text NOT NULL,
	"click_url" text,
	"status" "creative_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_runtime_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"timeouts" jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" bigint NOT NULL,
	"campaign_id" uuid NOT NULL,
	"creative_id" uuid NOT NULL,
	"creative_version_id" uuid,
	"tag_id" bigint NOT NULL,
	"delivery_token" text NOT NULL,
	"mode" "delivery_mode" NOT NULL,
	"plcmt" integer,
	"width" integer,
	"height" integer,
	"autoplay_mode" "autoplay_mode",
	"initial_muted" boolean DEFAULT true NOT NULL,
	"skippable" boolean DEFAULT false NOT NULL,
	"skip_offset_sec" real,
	"allowed_domains" text[],
	"click_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "upload_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" bigint NOT NULL,
	"campaign_id" uuid NOT NULL,
	"creative_id" uuid,
	"creative_type" "creative_type" NOT NULL,
	"staging_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"declared_mime" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"status" "upload_status" DEFAULT 'created' NOT NULL,
	"multipart_upload_id" text,
	"processing_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "ad_session_id" uuid;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "campaign_ref_id" uuid;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "creative_ref_id" uuid;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "creative_version_id" uuid;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "placement_id" uuid;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "delivery_mode" "delivery_mode";--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "measurement_mode" "measurement_mode" DEFAULT 'legacy_tag' NOT NULL;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "finalization_reason" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ad_sessions" ADD CONSTRAINT "ad_sessions_placement_id_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."placements"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ad_sessions" ADD CONSTRAINT "ad_sessions_creative_version_id_creative_versions_id_fk" FOREIGN KEY ("creative_version_id") REFERENCES "public"."creative_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ad_sessions" ADD CONSTRAINT "ad_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ad_sessions" ADD CONSTRAINT "ad_sessions_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creative_processing_jobs" ADD CONSTRAINT "creative_processing_jobs_upload_session_id_upload_sessions_id_fk" FOREIGN KEY ("upload_session_id") REFERENCES "public"."upload_sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creative_version_assets" ADD CONSTRAINT "creative_version_assets_creative_version_id_creative_versions_id_fk" FOREIGN KEY ("creative_version_id") REFERENCES "public"."creative_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creative_version_assets" ADD CONSTRAINT "creative_version_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creative_versions" ADD CONSTRAINT "creative_versions_creative_id_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."creatives"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creative_versions" ADD CONSTRAINT "creative_versions_source_asset_id_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creatives" ADD CONSTRAINT "creatives_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "creatives" ADD CONSTRAINT "creatives_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "placements" ADD CONSTRAINT "placements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "placements" ADD CONSTRAINT "placements_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "placements" ADD CONSTRAINT "placements_creative_id_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."creatives"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "placements" ADD CONSTRAINT "placements_creative_version_id_creative_versions_id_fk" FOREIGN KEY ("creative_version_id") REFERENCES "public"."creative_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "placements" ADD CONSTRAINT "placements_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_creative_id_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."creatives"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_sessions_placement_id" ON "ad_sessions" USING btree ("placement_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_sessions_user_id" ON "ad_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_sessions_created_at" ON "ad_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_sessions_measurement_mode" ON "ad_sessions" USING btree ("measurement_mode");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_sessions_creative_version_id" ON "ad_sessions" USING btree ("creative_version_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ad_sessions_tag_id" ON "ad_sessions" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_assets_sha256" ON "assets" USING btree ("sha256");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_assets_storage_key" ON "assets" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_assets_status" ON "assets" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_campaigns_uuid" ON "campaigns" USING btree ("uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_campaigns_user_id" ON "campaigns" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_campaigns_user_campaign_key" ON "campaigns" USING btree ("user_id","campaign_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_cpj_upload_session_id" ON "creative_processing_jobs" USING btree ("upload_session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cpj_status_available" ON "creative_processing_jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cpj_locked_at" ON "creative_processing_jobs" USING btree ("locked_at") WHERE "creative_processing_jobs"."locked_at" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_cva_creative_version_asset_role" ON "creative_version_assets" USING btree ("creative_version_id","asset_id","role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cva_creative_version_id" ON "creative_version_assets" USING btree ("creative_version_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cva_asset_id" ON "creative_version_assets" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_creative_versions_uuid" ON "creative_versions" USING btree ("uuid");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_creative_versions_creative_version" ON "creative_versions" USING btree ("creative_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_creatives_uuid" ON "creatives" USING btree ("uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creatives_user_id" ON "creatives" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creatives_campaign_id" ON "creatives" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_creatives_campaign_creative_key" ON "creatives" USING btree ("campaign_id","creative_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_delivery_runtime_configs_version" ON "delivery_runtime_configs" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_delivery_runtime_configs_active" ON "delivery_runtime_configs" USING btree ("is_active") WHERE "delivery_runtime_configs"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_placements_uuid" ON "placements" USING btree ("uuid");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_placements_delivery_token" ON "placements" USING btree ("delivery_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_placements_user_id" ON "placements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_placements_campaign_id" ON "placements" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_placements_creative_id" ON "placements" USING btree ("creative_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_upload_sessions_uuid" ON "upload_sessions" USING btree ("uuid");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_upload_sessions_staging_key" ON "upload_sessions" USING btree ("staging_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upload_sessions_user_id" ON "upload_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upload_sessions_status" ON "upload_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upload_sessions_expires_at" ON "upload_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upload_sessions_creative_id" ON "upload_sessions" USING btree ("creative_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "impressions" ADD CONSTRAINT "impressions_ad_session_id_ad_sessions_ad_session_id_fk" FOREIGN KEY ("ad_session_id") REFERENCES "public"."ad_sessions"("ad_session_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "impressions" ADD CONSTRAINT "impressions_campaign_ref_id_campaigns_id_fk" FOREIGN KEY ("campaign_ref_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "impressions" ADD CONSTRAINT "impressions_creative_ref_id_creatives_id_fk" FOREIGN KEY ("creative_ref_id") REFERENCES "public"."creatives"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "impressions" ADD CONSTRAINT "impressions_creative_version_id_creative_versions_id_fk" FOREIGN KEY ("creative_version_id") REFERENCES "public"."creative_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "impressions" ADD CONSTRAINT "impressions_placement_id_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."placements"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_impressions_ad_session_id" ON "impressions" USING btree ("ad_session_id") WHERE "impressions"."ad_session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_impressions_measurement_mode" ON "impressions" USING btree ("measurement_mode");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_impressions_creative_version_id" ON "impressions" USING btree ("creative_version_id") WHERE "impressions"."creative_version_id" IS NOT NULL;
--> statement-breakpoint
INSERT INTO "delivery_runtime_configs" ("version", "timeouts", "is_active") VALUES (
    'v1.0',
    '{"configRequestMs":5000,"vastRequestMs":8000,"mediaStartMs":15000,"firstFrameMs":10000,"contentHandoffMs":5000,"adLoadTotalMs":30000}',
    true
);