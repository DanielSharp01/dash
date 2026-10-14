ALTER TABLE "foods" DROP CONSTRAINT "foods_public_key";--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "published_by" uuid;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_seed_key" CHECK ("foods"."public_key" is null or "foods"."user_id" is null);