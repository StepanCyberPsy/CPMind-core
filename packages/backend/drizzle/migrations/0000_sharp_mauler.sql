CREATE TABLE IF NOT EXISTS "impressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"impression_id" uuid NOT NULL,
	"campaign_id" text NOT NULL,
	"creative_id" text NOT NULL,
	"creative_type" text NOT NULL,
	"device_type" text NOT NULL,
	"timestamp_start" bigint NOT NULL,
	"timestamp_end" bigint NOT NULL,
	"signals_raw" jsonb NOT NULL,
	"signals_normalized" jsonb NOT NULL,
	"s1_raw_time_in_view" real,
	"s2_raw_share_of_screen" real,
	"s3_raw_scroll_speed" real,
	"s4_raw_active_time_pct" real,
	"s5_raw_top_event" text NOT NULL,
	"s7_raw_persistence" real,
	"s1_normalized" real,
	"s2_normalized" real,
	"s3_normalized" real,
	"s4_normalized" real,
	"s5_normalized" real,
	"s7_normalized" real,
	"f_presence" smallint NOT NULL,
	"score_final" real NOT NULL,
	"weights_version" text DEFAULT 'v1.0_uncalibrated' NOT NULL,
	"no_events" boolean DEFAULT false NOT NULL,
	"tab_mostly_hidden" boolean DEFAULT false NOT NULL,
	"anomaly_duration" boolean DEFAULT false NOT NULL,
	"is_suspicious" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_impression_id" ON "impressions" USING btree ("impression_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_created_at" ON "impressions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_campaign_id" ON "impressions" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_creative_id" ON "impressions" USING btree ("creative_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_device_type" ON "impressions" USING btree ("device_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_is_suspicious" ON "impressions" USING btree ("is_suspicious");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_score_final" ON "impressions" USING btree ("score_final");