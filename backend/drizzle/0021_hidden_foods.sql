CREATE TABLE "hidden_foods" (
	"user_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	CONSTRAINT "hidden_foods_user_id_food_id_pk" PRIMARY KEY("user_id","food_id")
);
--> statement-breakpoint
ALTER TABLE "hidden_foods" ADD CONSTRAINT "hidden_foods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hidden_foods" ADD CONSTRAINT "hidden_foods_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;