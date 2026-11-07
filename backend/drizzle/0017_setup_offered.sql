ALTER TABLE "profiles" ADD COLUMN "setup_offered" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Accounts from before the setup existed are past their first visit, so it shouldn't open by itself for them.
UPDATE "profiles" SET "setup_offered" = true;