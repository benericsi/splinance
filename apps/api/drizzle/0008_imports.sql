CREATE TYPE "public"."import_source" AS ENUM('revolut', 'kh');--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"household_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"source" "import_source" NOT NULL,
	"file_name" text,
	"row_count" integer NOT NULL,
	"undone_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_batches_household_id_id_unique" UNIQUE("household_id","id"),
	CONSTRAINT "import_batches_row_count_non_negative" CHECK ("import_batches"."row_count" >= 0),
	CONSTRAINT "import_batches_file_name_length" CHECK (char_length("import_batches"."file_name") <= 200)
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "counterparty" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "import_fingerprint" text;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_member_fk" FOREIGN KEY ("household_id","created_by") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_batches_household_creator_idx" ON "import_batches" USING btree ("household_id","created_by","created_at");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_batch_fk" FOREIGN KEY ("household_id","import_batch_id") REFERENCES "public"."import_batches"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_import_fingerprint_unique" ON "transactions" USING btree ("household_id","created_by","import_fingerprint") WHERE "transactions"."import_fingerprint" is not null and "transactions"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_consistent" CHECK (("transactions"."import_batch_id" is null) = ("transactions"."import_fingerprint" is null));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_counterparty_length" CHECK (char_length("transactions"."counterparty") <= 120);