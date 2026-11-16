CREATE TABLE "savings_goal_plans" (
	"household_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"monthly_amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_goal_plans_pk" PRIMARY KEY("goal_id","user_id"),
	CONSTRAINT "savings_goal_plans_amount_range" CHECK ("savings_goal_plans"."monthly_amount" between 1 and 1000000000000)
);
--> statement-breakpoint
ALTER TABLE "savings_goal_plans" ADD CONSTRAINT "savings_goal_plans_goal_fk" FOREIGN KEY ("household_id","goal_id") REFERENCES "public"."savings_goals"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goal_plans" ADD CONSTRAINT "savings_goal_plans_user_member_fk" FOREIGN KEY ("household_id","user_id") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "savings_goal_plans_user_idx" ON "savings_goal_plans" USING btree ("household_id","user_id");