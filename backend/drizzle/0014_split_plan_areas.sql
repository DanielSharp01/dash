CREATE TABLE "fluid_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"effective_from" date DEFAULT '-infinity' NOT NULL,
	"goal_ml" double precision NOT NULL,
	CONSTRAINT "fluid_versions_userId_effectiveFrom_unique" UNIQUE("user_id","effective_from")
);
--> statement-breakpoint
CREATE TABLE "goal_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"effective_from" date DEFAULT '-infinity' NOT NULL,
	"kg_per_week" double precision NOT NULL,
	"target_kg" double precision,
	CONSTRAINT "goal_versions_userId_effectiveFrom_unique" UNIQUE("user_id","effective_from")
);
--> statement-breakpoint
CREATE TABLE "macro_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"effective_from" date DEFAULT '-infinity' NOT NULL,
	"preset" "macro_preset" NOT NULL,
	"protein_per_kg" double precision NOT NULL,
	"fat_pct" double precision,
	"carb_pct" double precision,
	CONSTRAINT "macro_versions_userId_effectiveFrom_unique" UNIQUE("user_id","effective_from"),
	CONSTRAINT "macro_versions_one_pct" CHECK (("macro_versions"."fat_pct" is null) <> ("macro_versions"."carb_pct" is null))
);
--> statement-breakpoint
CREATE TABLE "metabolism_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"effective_from" date DEFAULT '-infinity' NOT NULL,
	"multiplier" double precision NOT NULL,
	"calibrated_maintenance_kcal" double precision,
	"calibrated_exercise_kcal" double precision,
	CONSTRAINT "metabolism_versions_userId_effectiveFrom_unique" UNIQUE("user_id","effective_from"),
	CONSTRAINT "metabolism_versions_calibrated" CHECK (("metabolism_versions"."calibrated_maintenance_kcal" is null) = ("metabolism_versions"."calibrated_exercise_kcal" is null))
);
--> statement-breakpoint
-- Each area keeps a version only where its own values changed from the version before.
INSERT INTO "goal_versions" ("user_id", "effective_from", "kg_per_week", "target_kg")
SELECT "user_id", "effective_from", "goal_kg_per_week", "goal_target_kg" FROM (
	SELECT *, lag("goal_kg_per_week") OVER w AS "prev_kg", lag("goal_target_kg") OVER w AS "prev_target", row_number() OVER w AS "n"
	FROM "plan_versions" WINDOW w AS (PARTITION BY "user_id" ORDER BY "effective_from")
) v WHERE "n" = 1 OR "goal_kg_per_week" IS DISTINCT FROM "prev_kg" OR "goal_target_kg" IS DISTINCT FROM "prev_target";--> statement-breakpoint
INSERT INTO "metabolism_versions" ("user_id", "effective_from", "multiplier", "calibrated_maintenance_kcal", "calibrated_exercise_kcal")
SELECT "user_id", "effective_from", "metabolism_multiplier", "calibrated_maintenance_kcal", "calibrated_exercise_kcal" FROM (
	SELECT *, lag("metabolism_multiplier") OVER w AS "prev_multiplier", lag("calibrated_maintenance_kcal") OVER w AS "prev_maintenance",
		lag("calibrated_exercise_kcal") OVER w AS "prev_exercise", row_number() OVER w AS "n"
	FROM "plan_versions" WINDOW w AS (PARTITION BY "user_id" ORDER BY "effective_from")
) v WHERE "n" = 1 OR "metabolism_multiplier" IS DISTINCT FROM "prev_multiplier"
	OR "calibrated_maintenance_kcal" IS DISTINCT FROM "prev_maintenance" OR "calibrated_exercise_kcal" IS DISTINCT FROM "prev_exercise";--> statement-breakpoint
INSERT INTO "fluid_versions" ("user_id", "effective_from", "goal_ml")
SELECT "user_id", "effective_from", "fluid_goal_ml" FROM (
	SELECT *, lag("fluid_goal_ml") OVER w AS "prev_ml", row_number() OVER w AS "n"
	FROM "plan_versions" WINDOW w AS (PARTITION BY "user_id" ORDER BY "effective_from")
) v WHERE "n" = 1 OR "fluid_goal_ml" IS DISTINCT FROM "prev_ml";--> statement-breakpoint
INSERT INTO "macro_versions" ("user_id", "effective_from", "preset", "protein_per_kg", "fat_pct", "carb_pct")
SELECT "user_id", "effective_from", "macro_preset", "protein_per_kg", "fat_pct", "carb_pct" FROM (
	SELECT *, lag("macro_preset") OVER w AS "prev_preset", lag("protein_per_kg") OVER w AS "prev_protein",
		lag("fat_pct") OVER w AS "prev_fat", lag("carb_pct") OVER w AS "prev_carb", row_number() OVER w AS "n"
	FROM "plan_versions" WINDOW w AS (PARTITION BY "user_id" ORDER BY "effective_from")
) v WHERE "n" = 1 OR "macro_preset" IS DISTINCT FROM "prev_preset" OR "protein_per_kg" IS DISTINCT FROM "prev_protein"
	OR "fat_pct" IS DISTINCT FROM "prev_fat" OR "carb_pct" IS DISTINCT FROM "prev_carb";--> statement-breakpoint
DROP TABLE "plan_versions" CASCADE;--> statement-breakpoint
ALTER TABLE "fluid_versions" ADD CONSTRAINT "fluid_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_versions" ADD CONSTRAINT "goal_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "macro_versions" ADD CONSTRAINT "macro_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metabolism_versions" ADD CONSTRAINT "metabolism_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;