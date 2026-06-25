CREATE SEQUENCE IF NOT EXISTS "tag_constants_version_seq" START WITH 0 MINVALUE 0 INCREMENT BY 1;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tag_constants_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"constants" jsonb NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"script_path" text,
	"file_size_bytes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tag_constants_configs_version_unique" UNIQUE("version")
);
--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "tag_constants_version" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tag_constants_configs_is_active" ON "tag_constants_configs" USING btree ("is_active");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "impressions" ADD CONSTRAINT "impressions_tag_constants_version_tag_constants_configs_version_fk" FOREIGN KEY ("tag_constants_version") REFERENCES "public"."tag_constants_configs"("version") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_impressions_tag_constants_version" ON "impressions" USING btree ("tag_constants_version");