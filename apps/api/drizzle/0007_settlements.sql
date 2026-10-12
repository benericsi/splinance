ALTER TYPE "public"."audit_entity" ADD VALUE 'settlement';--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"household_id" uuid NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"currency" "currency" NOT NULL,
	"settled_on" date NOT NULL,
	"note" text,
	"created_by" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlements_different_people" CHECK ("settlements"."from_user_id" <> "settlements"."to_user_id"),
	CONSTRAINT "settlements_amount_range" CHECK ("settlements"."amount" between 1 and 1000000000000),
	CONSTRAINT "settlements_note_length" CHECK (char_length("settlements"."note") <= 200)
);
--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_from_member_fk" FOREIGN KEY ("household_id","from_user_id") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_to_member_fk" FOREIGN KEY ("household_id","to_user_id") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_created_by_member_fk" FOREIGN KEY ("household_id","created_by") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "settlements_household_settled_idx" ON "settlements" USING btree ("household_id","settled_on" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "settlements"."deleted_at" is null;