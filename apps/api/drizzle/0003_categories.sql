CREATE TYPE "public"."category_kind" AS ENUM('expense', 'income');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "category_kind" NOT NULL,
	"icon" text NOT NULL,
	"color" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_household_id_id_unique" UNIQUE("household_id","id"),
	CONSTRAINT "categories_name_length" CHECK (char_length("categories"."name") between 1 and 40)
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_household_kind_name_unique" ON "categories" USING btree ("household_id","kind",lower("name")) WHERE "categories"."archived_at" is null;