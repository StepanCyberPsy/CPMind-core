ALTER TABLE "placements" ADD COLUMN "domain_enforcement" text DEFAULT 'monitor' NOT NULL;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "publisher_domain" text;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "initial_muted_overridden" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "chk_placements_domain_enforcement" CHECK ("domain_enforcement" IN ('off', 'monitor', 'block'));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uidx_campaigns_user_lower_name" ON "campaigns" USING btree ("user_id", lower("name"));