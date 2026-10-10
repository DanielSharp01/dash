CREATE TYPE "public"."clock" AS ENUM('24h', '12h');--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "clock" "clock" DEFAULT '24h' NOT NULL;