CREATE TYPE "public"."locale" AS ENUM('en', 'hu');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" "locale";