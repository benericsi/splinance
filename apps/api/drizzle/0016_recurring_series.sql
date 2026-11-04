CREATE TYPE "public"."recurring_cadence" AS ENUM('weekly', 'monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."recurring_source" AS ENUM('manual', 'detected');--> statement-breakpoint
CREATE TYPE "public"."recurring_status" AS ENUM('active', 'dismissed');--> statement-breakpoint
CREATE TABLE "recurring_series" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid,
	"kind" "category_kind" DEFAULT 'expense' NOT NULL,
	"status" "recurring_status" NOT NULL,
	"source" "recurring_source" NOT NULL,
	"name" text,
	"pattern" text NOT NULL,
	"pattern_key" text NOT NULL,
	"cadence" "recurring_cadence",
	"amount" bigint,
	"amount_varies" boolean DEFAULT false NOT NULL,
	"currency" "currency" NOT NULL,
	"anchor_on" date,
	"starts_on" date,
	"category_id" uuid,
	"remind" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_series_household_id_id_unique" UNIQUE("household_id","id"),
	CONSTRAINT "recurring_series_expense_only" CHECK ("recurring_series"."kind" = 'expense'),
	CONSTRAINT "recurring_series_pattern_length" CHECK (char_length("recurring_series"."pattern") between 2 and 60),
	CONSTRAINT "recurring_series_name_length" CHECK (char_length("recurring_series"."name") between 1 and 60),
	CONSTRAINT "recurring_series_amount_range" CHECK ("recurring_series"."amount" between 1 and 1000000000000),
	CONSTRAINT "recurring_series_active_complete" CHECK ("recurring_series"."status" <> 'active' or ("recurring_series"."name" is not null and "recurring_series"."cadence" is not null and "recurring_series"."amount" is not null and "recurring_series"."anchor_on" is not null)),
	CONSTRAINT "recurring_series_starts_before_anchor" CHECK ("recurring_series"."starts_on" <= "recurring_series"."anchor_on")
);
--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_category_fk" FOREIGN KEY ("household_id","category_id","kind") REFERENCES "public"."categories"("household_id","id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_user_member_fk" FOREIGN KEY ("household_id","user_id") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_created_by_member_fk" FOREIGN KEY ("household_id","created_by") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_series_pattern_unique" ON "recurring_series" USING btree ("household_id",coalesce("user_id", '00000000-0000-0000-0000-000000000000'::uuid),"kind","pattern_key") WHERE "recurring_series"."archived_at" is null;