DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_f_presence_valid'
  ) THEN
    ALTER TABLE "impressions" ADD CONSTRAINT "chk_f_presence_valid" CHECK (f_presence IN (0, 1));
  END IF;
END $$;