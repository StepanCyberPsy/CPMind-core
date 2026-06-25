DO $$ BEGIN
 CREATE TYPE "public"."calibration_batch_status" AS ENUM('processing', 'ready', 'expired', 'failed', 'discarded');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."calibration_item_status" AS ENUM('pending', 'approved');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calibration_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_weights_config_id" uuid NOT NULL,
	"selection" jsonb NOT NULL,
	"status" "calibration_batch_status" DEFAULT 'processing' NOT NULL,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calibration_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"impression_id" uuid NOT NULL,
	"previous_score_final" real NOT NULL,
	"previous_weights_version" text NOT NULL,
	"new_score_final" real NOT NULL,
	"new_weights_version" text NOT NULL,
	"status" "calibration_item_status" DEFAULT 'pending' NOT NULL,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calibration_batches" ADD CONSTRAINT "calibration_batches_target_weights_config_id_weight_configs_id_fk" FOREIGN KEY ("target_weights_config_id") REFERENCES "public"."weight_configs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calibration_batches" ADD CONSTRAINT "calibration_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calibration_items" ADD CONSTRAINT "calibration_items_batch_id_calibration_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."calibration_batches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calibration_items" ADD CONSTRAINT "calibration_items_impression_id_impressions_id_fk" FOREIGN KEY ("impression_id") REFERENCES "public"."impressions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_calibration_batches_status_created_at" ON "calibration_batches" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_calibration_batches_created_by" ON "calibration_batches" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_calibration_items_batch_impression" ON "calibration_items" USING btree ("batch_id","impression_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_calibration_items_batch_status" ON "calibration_items" USING btree ("batch_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_calibration_items_impression_id" ON "calibration_items" USING btree ("impression_id");