ALTER TABLE "s5_logistic_configs" ADD COLUMN "label_params" jsonb;--> statement-breakpoint
ALTER TABLE "s5_logistic_configs" ADD COLUMN "label_positive_rate" real;--> statement-breakpoint
ALTER TABLE "s6_logistic_configs" ADD COLUMN "label_params" jsonb;--> statement-breakpoint
ALTER TABLE "s6_logistic_configs" ADD COLUMN "label_positive_rate" real;