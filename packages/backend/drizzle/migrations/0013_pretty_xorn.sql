CREATE TABLE IF NOT EXISTS "s4_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"segment_key" text NOT NULL,
	"version" text NOT NULL,
	"lambda" real NOT NULL,
	"t_ref_ms" integer NOT NULL,
	"sample_size" integer,
	"is_active" boolean DEFAULT false NOT NULL,
	"deletion_scheduled_at" timestamp with time zone,
	"fitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_s4_configs_active_segment" ON "s4_configs" USING btree ("segment_key") WHERE "s4_configs"."is_active" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_s4_configs_deletion_scheduled_at" ON "s4_configs" USING btree ("deletion_scheduled_at");