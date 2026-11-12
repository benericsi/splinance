CREATE TABLE "savings_entries" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"household_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"entry_on" date NOT NULL,
	"note" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_entries_amount_range" CHECK ("savings_entries"."amount" <> 0 and "savings_entries"."amount" between -1000000000000 and 1000000000000),
	CONSTRAINT "savings_entries_note_length" CHECK (char_length("savings_entries"."note") <= 200)
);
--> statement-breakpoint
CREATE TABLE "savings_goals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"target_amount" bigint,
	"target_date" date,
	"currency" "currency" NOT NULL,
	"visibility" "transaction_visibility" NOT NULL,
	"created_by" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_goals_household_id_id_unique" UNIQUE("household_id","id"),
	CONSTRAINT "savings_goals_name_length" CHECK (char_length("savings_goals"."name") between 1 and 60),
	CONSTRAINT "savings_goals_target_range" CHECK ("savings_goals"."target_amount" is null or "savings_goals"."target_amount" between 1 and 1000000000000)
);
--> statement-breakpoint
ALTER TABLE "savings_entries" ADD CONSTRAINT "savings_entries_goal_fk" FOREIGN KEY ("household_id","goal_id") REFERENCES "public"."savings_goals"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_entries" ADD CONSTRAINT "savings_entries_user_member_fk" FOREIGN KEY ("household_id","user_id") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_created_by_member_fk" FOREIGN KEY ("household_id","created_by") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "savings_entries_goal_entry_idx" ON "savings_entries" USING btree ("goal_id","entry_on" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "savings_entries"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "savings_entries_user_entry_idx" ON "savings_entries" USING btree ("household_id","user_id","entry_on") WHERE "savings_entries"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "savings_goals_household_idx" ON "savings_goals" USING btree ("household_id","id");