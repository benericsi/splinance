CREATE TYPE "public"."overview_view" AS ENUM('cards', 'map');--> statement-breakpoint
CREATE TYPE "public"."spending_view" AS ENUM('household', 'mine');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "overview_view" "overview_view" DEFAULT 'cards' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "transaction_visibility" "transaction_visibility" DEFAULT 'shared' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "spending_view" "spending_view" DEFAULT 'household' NOT NULL;