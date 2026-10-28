CREATE TABLE "demos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"household_id" uuid,
	"seed" integer NOT NULL,
	"anchor_on" date NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demos_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "demos_seed_non_negative" CHECK ("demos"."seed" >= 0),
	CONSTRAINT "demos_people_differ" CHECK ("demos"."user_id" <> "demos"."partner_id")
);
--> statement-breakpoint
ALTER TABLE "demos" ADD CONSTRAINT "demos_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demos" ADD CONSTRAINT "demos_partner_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demos" ADD CONSTRAINT "demos_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "demos_expires_at_idx" ON "demos" USING btree ("expires_at");