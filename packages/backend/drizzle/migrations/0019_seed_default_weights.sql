UPDATE "weight_configs"
SET
  "version" = 'v1.0_uncalibrated_banner',
  "description" = 'Стартовые экспертные веса для баннеров, не подтверждённые данными',
  "weights" = '{"s1":0.30,"s2":0.20,"s3":0.15,"s4":0.15,"s5":0.15,"s6":0.00,"s7":0.05}'
WHERE "version" = 'v1.0_uncalibrated';
--> statement-breakpoint
INSERT INTO "weight_configs" ("version", "config_type", "weights", "description", "is_active")
VALUES (
  'v1.0_uncalibrated_video',
  'video',
  '{"s1":0.15,"s2":0.10,"s3":0.10,"s4":0.10,"s5":0.10,"s6":0.40,"s7":0.05}',
  'Стартовые экспертные веса для видео, не подтверждённые данными',
  true
)
ON CONFLICT ("version") DO NOTHING;