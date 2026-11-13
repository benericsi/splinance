CREATE TABLE "savings_rules" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"pattern" text NOT NULL,
	"pattern_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_rules_user_pattern_unique" UNIQUE("household_id","user_id","pattern_key"),
	CONSTRAINT "savings_rules_pattern_length" CHECK (char_length("savings_rules"."pattern") between 2 and 60)
);
--> statement-breakpoint
ALTER TABLE "savings_entries" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "savings_entries" ADD COLUMN "import_fingerprint" text;--> statement-breakpoint
ALTER TABLE "savings_rules" ADD CONSTRAINT "savings_rules_user_member_fk" FOREIGN KEY ("household_id","user_id") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_rules" ADD CONSTRAINT "savings_rules_goal_fk" FOREIGN KEY ("household_id","goal_id") REFERENCES "public"."savings_goals"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_entries" ADD CONSTRAINT "savings_entries_import_batch_fk" FOREIGN KEY ("household_id","import_batch_id") REFERENCES "public"."import_batches"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "savings_entries_import_fingerprint_unique" ON "savings_entries" USING btree ("household_id","user_id","import_fingerprint") WHERE "savings_entries"."import_fingerprint" is not null and "savings_entries"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "savings_entries" ADD CONSTRAINT "savings_entries_import_consistent" CHECK (("savings_entries"."import_batch_id" is null) = ("savings_entries"."import_fingerprint" is null));