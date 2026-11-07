CREATE TYPE "public"."container_kind" AS ENUM('pot', 'glass');--> statement-breakpoint
ALTER TABLE "pots" RENAME TO "containers";--> statement-breakpoint
ALTER INDEX "pots_pkey" RENAME TO "containers_pkey";--> statement-breakpoint
ALTER INDEX "pots_user_id_index" RENAME TO "containers_user_id_index";--> statement-breakpoint
ALTER TABLE "containers" RENAME CONSTRAINT "pots_user_id_users_id_fk" TO "containers_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "containers" ADD COLUMN "kind" "container_kind" DEFAULT 'pot' NOT NULL;--> statement-breakpoint
ALTER TABLE "containers" ADD COLUMN "capacity_ml" double precision;--> statement-breakpoint
ALTER TABLE "containers" ALTER COLUMN "grams" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_pot_weighed" CHECK ("containers"."kind" <> 'pot' or "containers"."grams" is not null);--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_weight_or_capacity" CHECK ("containers"."grams" is not null or "containers"."capacity_ml" is not null);
