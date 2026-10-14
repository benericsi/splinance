CREATE TABLE "category_rules" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"household_id" uuid NOT NULL,
	"pattern" text NOT NULL,
	"pattern_key" text NOT NULL,
	"category_id" uuid NOT NULL,
	"kind" "category_kind" NOT NULL,
	"mark_shared" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_rules_household_kind_pattern_unique" UNIQUE("household_id","kind","pattern_key"),
	CONSTRAINT "category_rules_pattern_length" CHECK (char_length("category_rules"."pattern") between 2 and 60),
	CONSTRAINT "category_rules_position_non_negative" CHECK ("category_rules"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_category_fk" FOREIGN KEY ("household_id","category_id","kind") REFERENCES "public"."categories"("household_id","id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_created_by_member_fk" FOREIGN KEY ("household_id","created_by") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;