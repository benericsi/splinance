CREATE TYPE "public"."notification_action" AS ENUM('create', 'update', 'delete', 'restore', 'undo');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('renewal_due', 'renewal_missed', 'price_changed', 'budget_near', 'budget_over', 'tx_added', 'tx_changed', 'tx_deleted', 'import_added', 'settlement_recorded');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"action" "notification_action",
	"actor_id" uuid,
	"subject_id" uuid NOT NULL,
	"due_on" date,
	"amount" bigint,
	"previous_amount" bigint,
	"count" integer,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "household_members" ADD COLUMN "notify_activity" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_member_fk" FOREIGN KEY ("household_id","user_id") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_member_fk" FOREIGN KEY ("household_id","actor_id") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_dedupe_unique" ON "notifications" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_activity_unread_unique" ON "notifications" USING btree ("user_id","subject_id") WHERE "notifications"."read_at" is null and "notifications"."type" in ('tx_added', 'tx_changed', 'tx_deleted', 'import_added', 'settlement_recorded');--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_household_idx" ON "notifications" USING btree ("household_id");