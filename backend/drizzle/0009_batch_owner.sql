ALTER TABLE "batches" ADD COLUMN "user_id" uuid;--> statement-breakpoint
UPDATE "batches" b SET "user_id" = f."user_id" FROM "foods" f WHERE f."id" = b."recipe_id";--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;