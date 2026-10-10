CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'restore');--> statement-breakpoint
CREATE TYPE "public"."audit_entity" AS ENUM('transaction');--> statement-breakpoint
CREATE TYPE "public"."split_method" AS ENUM('equal', 'percentage', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."transaction_visibility" AS ENUM('shared', 'private');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"household_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"entity" "audit_entity" NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" "audit_action" NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_splits" (
	"transaction_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"basis_points" integer,
	CONSTRAINT "transaction_splits_pk" PRIMARY KEY("transaction_id","user_id"),
	CONSTRAINT "transaction_splits_amount_non_negative" CHECK ("transaction_splits"."amount" >= 0),
	CONSTRAINT "transaction_splits_basis_points_range" CHECK ("transaction_splits"."basis_points" is null or "transaction_splits"."basis_points" between 1 and 10000)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"household_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"paid_by" uuid NOT NULL,
	"kind" "category_kind" NOT NULL,
	"visibility" "transaction_visibility" NOT NULL,
	"amount" bigint NOT NULL,
	"currency" "currency" NOT NULL,
	"occurred_on" date NOT NULL,
	"description" text NOT NULL,
	"category_id" uuid,
	"split_method" "split_method",
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_household_id_id_unique" UNIQUE("household_id","id"),
	CONSTRAINT "transactions_amount_range" CHECK ("transactions"."amount" between 1 and 1000000000000),
	CONSTRAINT "transactions_description_length" CHECK (char_length("transactions"."description") between 1 and 120),
	CONSTRAINT "transactions_private_paid_by_author" CHECK ("transactions"."visibility" = 'shared' or "transactions"."paid_by" = "transactions"."created_by"),
	CONSTRAINT "transactions_split_method_iff_shared" CHECK (("transactions"."visibility" = 'shared') = ("transactions"."split_method" is not null)),
	CONSTRAINT "transactions_version_positive" CHECK ("transactions"."version" >= 1)
);
--> statement-breakpoint
-- Must exist before transactions_category_fk, which references it.
ALTER TABLE "categories" ADD CONSTRAINT "categories_household_id_id_kind_unique" UNIQUE("household_id","id","kind");--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_member_fk" FOREIGN KEY ("household_id","actor_id") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_transaction_fk" FOREIGN KEY ("household_id","transaction_id") REFERENCES "public"."transactions"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_member_fk" FOREIGN KEY ("household_id","user_id") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_member_fk" FOREIGN KEY ("household_id","created_by") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_paid_by_member_fk" FOREIGN KEY ("household_id","paid_by") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_fk" FOREIGN KEY ("household_id","category_id","kind") REFERENCES "public"."categories"("household_id","id","kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "transaction_splits_household_user_idx" ON "transaction_splits" USING btree ("household_id","user_id");--> statement-breakpoint
CREATE INDEX "transactions_household_occurred_idx" ON "transactions" USING btree ("household_id","occurred_on" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "transactions"."deleted_at" is null;