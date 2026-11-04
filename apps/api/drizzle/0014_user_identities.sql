CREATE TABLE "user_identities" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_identities_provider_subject_unique" UNIQUE("provider","subject"),
	CONSTRAINT "user_identities_user_provider_unique" UNIQUE("user_id","provider"),
	CONSTRAINT "user_identities_provider_format" CHECK ("user_identities"."provider" ~ '^[a-z][a-z0-9-]{1,31}$'),
	CONSTRAINT "user_identities_subject_length" CHECK (char_length("user_identities"."subject") between 1 and 255)
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;