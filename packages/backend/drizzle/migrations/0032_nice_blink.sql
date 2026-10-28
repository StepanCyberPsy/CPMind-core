ALTER TYPE "measurement_mode" ADD VALUE 'vast_omid';--> statement-breakpoint
ALTER TABLE "impressions" ALTER COLUMN "f_presence" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "impressions" ALTER COLUMN "score_final" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_versions" ADD COLUMN "external_vast_url" text;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "omid_access_mode" text;--> statement-breakpoint
ALTER TABLE "impressions" ADD COLUMN "vast_delivery_kind" text;--> statement-breakpoint
-- Обязательность score_final и f_presence сохраняется для всех режимов измерения,
-- кроме vast_omid: показ, измеренный через OMID без доступа к верхнему окну, не имеет
-- части сигналов, поэтому композитный Score и presence для него не рассчитываются.
--
-- Сравнение ведётся по текстовому представлению намеренно. Drizzle применяет все
-- миграции в одной транзакции, а Postgres запрещает использовать значение enum,
-- добавленное в этой же транзакции ("unsafe use of new value of enum type").
-- Приведение к text этого ограничения не нарушает.
--
-- NOT VALID + VALIDATE: добавление берёт ACCESS EXCLUSIVE лишь на правку каталога,
-- а проверка существующих строк идёт под SHARE UPDATE EXCLUSIVE и не блокирует
-- чтение и запись таблицы.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_score_final_required'
  ) THEN
    ALTER TABLE "impressions" ADD CONSTRAINT "chk_score_final_required"
      CHECK (measurement_mode::text = 'vast_omid' OR score_final IS NOT NULL) NOT VALID;
    ALTER TABLE "impressions" VALIDATE CONSTRAINT "chk_score_final_required";
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_f_presence_required'
  ) THEN
    ALTER TABLE "impressions" ADD CONSTRAINT "chk_f_presence_required"
      CHECK (measurement_mode::text = 'vast_omid' OR f_presence IS NOT NULL) NOT VALID;
    ALTER TABLE "impressions" VALIDATE CONSTRAINT "chk_f_presence_required";
  END IF;
END $$;
