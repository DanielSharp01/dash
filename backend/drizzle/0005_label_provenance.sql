CREATE TYPE "public"."label_origin" AS ENUM('open-food-facts', 'usda', 'ciqual', 'online', 'estimate');--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN "verified" boolean;--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN "origin" "label_origin";--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN "origin_rev" integer;--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN "url" text;--> statement-breakpoint
UPDATE "labels" SET "verified" = "source" = 'package', "origin" = CASE "source" WHEN 'database' THEN 'open-food-facts' WHEN 'reference' THEN 'usda' WHEN 'typed' THEN 'estimate' END::"label_origin";--> statement-breakpoint
ALTER TABLE "labels" ALTER COLUMN "verified" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_provenance" CHECK (case when "labels"."verified" then "labels"."origin" is null or "labels"."origin" in ('open-food-facts', 'online') else "labels"."origin" is not null end);--> statement-breakpoint
ALTER TABLE "labels" DROP COLUMN "source";--> statement-breakpoint
DROP TYPE "public"."label_source";
