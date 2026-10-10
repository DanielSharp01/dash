CREATE TYPE "public"."burn_basis" AS ENUM('distance', 'reps', 'duration');--> statement-breakpoint
CREATE TYPE "public"."day_part" AS ENUM('dawn', 'morning', 'afternoon', 'evening', 'night');--> statement-breakpoint
CREATE TYPE "public"."entry_kind" AS ENUM('food', 'exercise');--> statement-breakpoint
CREATE TYPE "public"."food_kind" AS ENUM('item', 'recipe', 'combo');--> statement-breakpoint
CREATE TYPE "public"."food_unit" AS ENUM('g', 'ml', 'piece');--> statement-breakpoint
CREATE TYPE "public"."label_per" AS ENUM('100', 'serving');--> statement-breakpoint
CREATE TYPE "public"."label_source" AS ENUM('package', 'database', 'reference', 'typed');--> statement-breakpoint
CREATE TYPE "public"."macro_preset" AS ENUM('balanced', 'high-protein', 'low-carb', 'keto', 'low-fat');--> statement-breakpoint
CREATE TYPE "public"."measure_key" AS ENUM('distance', 'duration', 'sets', 'reps', 'weight', 'laps');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."unit_system" AS ENUM('metric', 'imperial');--> statement-breakpoint
CREATE TYPE "public"."via" AS ENUM('ate', 'drank');--> statement-breakpoint
CREATE TYPE "public"."when_kind" AS ENUM('now', 'exact', 'part', 'day');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"icon_auto" boolean DEFAULT true NOT NULL,
	"measures" "measure_key"[] NOT NULL,
	"burn_basis" "burn_basis",
	"burn_factor" double precision,
	"public_key" text,
	"starter" boolean DEFAULT false NOT NULL,
	"origin_id" uuid,
	"deleted_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_publicKey_unique" UNIQUE("public_key"),
	CONSTRAINT "activities_burn" CHECK (("activities"."burn_basis" is null) = ("activities"."burn_factor" is null)),
	CONSTRAINT "activities_public_key" CHECK (("activities"."user_id" is null) = ("activities"."public_key" is not null)),
	CONSTRAINT "activities_starter_public" CHECK (not "activities"."starter" or "activities"."user_id" is null)
);
--> statement-breakpoint
CREATE TABLE "batch_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"food_kind" "food_kind" DEFAULT 'item' NOT NULL,
	"amount_value" double precision,
	"amount_unit" text,
	"base" double precision,
	"position" smallint NOT NULL,
	CONSTRAINT "batch_ingredients_item" CHECK ("batch_ingredients"."food_kind" = 'item')
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"recipe_id" uuid NOT NULL,
	"recipe_kind" "food_kind" DEFAULT 'recipe' NOT NULL,
	"made_on" date NOT NULL,
	"yield_grams" double precision,
	"yield_portions" double precision,
	"gone" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batches_id_recipe" UNIQUE("id","recipe_id"),
	CONSTRAINT "batches_recipe_kind" CHECK ("batches"."recipe_kind" = 'recipe'),
	CONSTRAINT "batches_one_yield" CHECK ("batches"."yield_grams" is null or "batches"."yield_portions" is null)
);
--> statement-breakpoint
CREATE TABLE "combo_parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"combo_id" uuid NOT NULL,
	"combo_kind" "food_kind" DEFAULT 'combo' NOT NULL,
	"food_id" uuid NOT NULL,
	"amount_value" double precision,
	"amount_unit" text,
	"position" smallint NOT NULL,
	CONSTRAINT "combo_parts_combo" CHECK ("combo_parts"."combo_kind" = 'combo')
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "entry_kind" NOT NULL,
	"when_date" date NOT NULL,
	"when_kind" "when_kind" NOT NULL,
	"when_time" time,
	"when_part" "day_part",
	"via" "via",
	"combo_id" uuid,
	"combo_kind" "food_kind",
	"activity_id" uuid,
	"kcal" double precision,
	"kcal_manual" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entries_when" CHECK (case "entries"."when_kind"
        when 'part' then "entries"."when_part" is not null and "entries"."when_time" is null
        when 'day' then "entries"."when_part" is null and "entries"."when_time" is null
        else "entries"."when_time" is not null and "entries"."when_part" is null end),
	CONSTRAINT "entries_kind" CHECK (case "entries"."kind"
        when 'food' then "entries"."via" is not null and "entries"."activity_id" is null and "entries"."kcal" is null and not "entries"."kcal_manual"
        else "entries"."activity_id" is not null and "entries"."via" is null and "entries"."combo_id" is null end),
	CONSTRAINT "entries_combo_kind" CHECK (("entries"."combo_id" is null) = ("entries"."combo_kind" is null) and ("entries"."combo_kind" is null or "entries"."combo_kind" = 'combo'))
);
--> statement-breakpoint
CREATE TABLE "entry_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entry_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"food_id" uuid,
	"batch_id" uuid,
	"raw_name" text,
	"barcode" text,
	"amount_value" double precision,
	"amount_unit" text,
	"base" double precision
);
--> statement-breakpoint
CREATE TABLE "exercise_measures" (
	"entry_id" uuid NOT NULL,
	"key" "measure_key" NOT NULL,
	"value" double precision NOT NULL,
	"unit" text NOT NULL,
	CONSTRAINT "exercise_measures_entry_id_key_pk" PRIMARY KEY("entry_id","key")
);
--> statement-breakpoint
CREATE TABLE "foods" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"kind" "food_kind" NOT NULL,
	"catalogued" boolean DEFAULT true NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"icon_auto" boolean DEFAULT true NOT NULL,
	"unit" "food_unit",
	"variant" text,
	"barcode" text,
	"not_fluid" boolean DEFAULT false NOT NULL,
	"unsure" boolean DEFAULT false NOT NULL,
	"public_key" text,
	"starter" boolean DEFAULT false NOT NULL,
	"origin_id" uuid,
	"deleted_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "foods_publicKey_unique" UNIQUE("public_key"),
	CONSTRAINT "foods_id_kind" UNIQUE("id","kind"),
	CONSTRAINT "foods_item_unit" CHECK (("foods"."kind" = 'item') = ("foods"."unit" is not null)),
	CONSTRAINT "foods_public_key" CHECK (("foods"."user_id" is null) = ("foods"."public_key" is not null)),
	CONSTRAINT "foods_starter_public" CHECK (not "foods"."starter" or "foods"."user_id" is null)
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"food_id" uuid NOT NULL,
	"effective_from" date DEFAULT '-infinity' NOT NULL,
	"per" "label_per" NOT NULL,
	"serving_size" double precision,
	"serving_name" text,
	"serving_pieces_count" double precision,
	"serving_pieces_name" text,
	"source" "label_source" NOT NULL,
	"kcal" double precision,
	"fat" double precision,
	"saturates" double precision,
	"carbs" double precision,
	"sugars" double precision,
	"protein" double precision,
	"salt" double precision,
	"caffeine" double precision,
	CONSTRAINT "labels_foodId_effectiveFrom_unique" UNIQUE("food_id","effective_from"),
	CONSTRAINT "labels_pieces" CHECK (("labels"."serving_pieces_count" is null) = ("labels"."serving_pieces_name" is null))
);
--> statement-breakpoint
CREATE TABLE "plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"effective_from" date DEFAULT '-infinity' NOT NULL,
	"goal_kg_per_week" double precision NOT NULL,
	"goal_target_kg" double precision,
	"metabolism_multiplier" double precision NOT NULL,
	"calibrated_maintenance_kcal" double precision,
	"calibrated_exercise_kcal" double precision,
	"fluid_goal_ml" double precision NOT NULL,
	"macro_preset" "macro_preset" NOT NULL,
	"protein_per_kg" double precision NOT NULL,
	"fat_pct" double precision,
	"carb_pct" double precision,
	CONSTRAINT "plan_versions_userId_effectiveFrom_unique" UNIQUE("user_id","effective_from"),
	CONSTRAINT "plan_versions_calibrated" CHECK (("plan_versions"."calibrated_maintenance_kcal" is null) = ("plan_versions"."calibrated_exercise_kcal" is null)),
	CONSTRAINT "plan_versions_one_pct" CHECK (("plan_versions"."fat_pct" is null) <> ("plan_versions"."carb_pct" is null))
);
--> statement-breakpoint
CREATE TABLE "pots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"grams" double precision NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"units" "unit_system" DEFAULT 'metric' NOT NULL,
	"height_cm" double precision,
	"birthday" date,
	"sex" "sex",
	"day_ends_at" smallint DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"plan_revision" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "profiles_day_ends_at" CHECK ("profiles"."day_ends_at" between 0 and 6)
);
--> statement-breakpoint
CREATE TABLE "servings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"food_id" uuid NOT NULL,
	"name" text NOT NULL,
	"size" double precision,
	"position" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_sub" text NOT NULL,
	"email" text,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_googleSub_unique" UNIQUE("google_sub")
);
--> statement-breakpoint
CREATE TABLE "weigh_ins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"kg" double precision NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_origin_id_activities_id_fk" FOREIGN KEY ("origin_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_ingredients" ADD CONSTRAINT "batch_ingredients_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_ingredients" ADD CONSTRAINT "batch_ingredients_food_id_food_kind_foods_id_kind_fk" FOREIGN KEY ("food_id","food_kind") REFERENCES "public"."foods"("id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_recipe_id_recipe_kind_foods_id_kind_fk" FOREIGN KEY ("recipe_id","recipe_kind") REFERENCES "public"."foods"("id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combo_parts" ADD CONSTRAINT "combo_parts_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combo_parts" ADD CONSTRAINT "combo_parts_combo_id_combo_kind_foods_id_kind_fk" FOREIGN KEY ("combo_id","combo_kind") REFERENCES "public"."foods"("id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_combo_id_combo_kind_foods_id_kind_fk" FOREIGN KEY ("combo_id","combo_kind") REFERENCES "public"."foods"("id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_lines" ADD CONSTRAINT "entry_lines_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_lines" ADD CONSTRAINT "entry_lines_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_lines" ADD CONSTRAINT "entry_lines_batch_id_food_id_batches_id_recipe_id_fk" FOREIGN KEY ("batch_id","food_id") REFERENCES "public"."batches"("id","recipe_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_measures" ADD CONSTRAINT "exercise_measures_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_origin_id_foods_id_fk" FOREIGN KEY ("origin_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pots" ADD CONSTRAINT "pots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servings" ADD CONSTRAINT "servings_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weigh_ins" ADD CONSTRAINT "weigh_ins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_user_id_index" ON "activities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "batch_ingredients_batch_id_index" ON "batch_ingredients" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "batch_ingredients_food_id_index" ON "batch_ingredients" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "batches_recipe_id_index" ON "batches" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "combo_parts_combo_id_index" ON "combo_parts" USING btree ("combo_id");--> statement-breakpoint
CREATE INDEX "combo_parts_food_id_index" ON "combo_parts" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "entries_user_id_when_date_index" ON "entries" USING btree ("user_id","when_date");--> statement-breakpoint
CREATE INDEX "entry_lines_entry_id_index" ON "entry_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "entry_lines_food_id_index" ON "entry_lines" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "entry_lines_batch_id_index" ON "entry_lines" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "foods_user_id_index" ON "foods" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "foods_user_barcode" ON "foods" USING btree ("user_id","barcode") WHERE "foods"."barcode" is not null;--> statement-breakpoint
CREATE INDEX "pots_user_id_index" ON "pots" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "servings_food_name" ON "servings" USING btree ("food_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "weigh_ins_user_date_live" ON "weigh_ins" USING btree ("user_id","date") WHERE "weigh_ins"."deleted_at" is null;