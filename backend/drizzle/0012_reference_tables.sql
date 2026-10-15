CREATE TYPE "public"."reference_table" AS ENUM('usda', 'ciqual');--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "source" "reference_table";--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "source_ref" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "generic_source" "reference_table";--> statement-breakpoint
CREATE UNIQUE INDEX "foods_source_ref" ON "foods" USING btree ("source","source_ref") WHERE "foods"."source" is not null;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_source_public" CHECK ("foods"."source" is null or ("foods"."user_id" is null and "foods"."source_ref" is not null));