ALTER TABLE "impressions"
  ADD CONSTRAINT "chk_f_presence_valid" CHECK (f_presence IN (0, 1));