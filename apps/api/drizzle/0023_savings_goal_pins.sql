CREATE TABLE "savings_goal_pins" (
	"household_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_goal_pins_pk" PRIMARY KEY("goal_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "savings_goal_pins" ADD CONSTRAINT "savings_goal_pins_goal_fk" FOREIGN KEY ("household_id","goal_id") REFERENCES "public"."savings_goals"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goal_pins" ADD CONSTRAINT "savings_goal_pins_user_member_fk" FOREIGN KEY ("household_id","user_id") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "savings_goal_pins_user_idx" ON "savings_goal_pins" USING btree ("household_id","user_id");