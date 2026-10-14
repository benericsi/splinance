CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"household_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"kind" "category_kind" DEFAULT 'expense' NOT NULL,
	"user_id" uuid,
	"starts_on" date NOT NULL,
	"amount" bigint,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_category_owner_month_unique" UNIQUE NULLS NOT DISTINCT("household_id","category_id","user_id","starts_on"),
	CONSTRAINT "budgets_expense_only" CHECK ("budgets"."kind" = 'expense'),
	CONSTRAINT "budgets_month_start" CHECK (extract(day from "budgets"."starts_on") = 1),
	CONSTRAINT "budgets_amount_range" CHECK ("budgets"."amount" is null or "budgets"."amount" between 1 and 1000000000000)
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_fk" FOREIGN KEY ("household_id","category_id","kind") REFERENCES "public"."categories"("household_id","id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_member_fk" FOREIGN KEY ("household_id","user_id") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_created_by_member_fk" FOREIGN KEY ("household_id","created_by") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budgets_household_starts_idx" ON "budgets" USING btree ("household_id","starts_on");