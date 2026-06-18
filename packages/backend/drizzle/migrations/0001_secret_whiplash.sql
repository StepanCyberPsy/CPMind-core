CREATE TABLE IF NOT EXISTS "weight_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"weights" jsonb NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weight_configs_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_weight_configs_is_active" ON "weight_configs" USING btree ("is_active");
--> statement-breakpoint
INSERT INTO "weight_configs" ("version", "weights", "description", "is_active")
VALUES (
  'v1.0_uncalibrated',
  '{"s1":0.30,"s2":0.20,"s3":0.15,"s4":0.15,"s5":0.15,"s7":0.05}',
  'Стартовые экспертные веса, не подтверждённые данными',
  true
);