CREATE TYPE "public"."plan_area" AS ENUM('goal', 'metabolism', 'fluid', 'macros');--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "chosen_plan_areas" "plan_area"[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- Accounts from before this have been using their plan, so every area counts as set; only new accounts start with none.
UPDATE "profiles" SET "chosen_plan_areas" = '{goal,metabolism,fluid,macros}';