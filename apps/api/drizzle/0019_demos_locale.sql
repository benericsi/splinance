ALTER TABLE "demos" ADD COLUMN "locale" "locale" DEFAULT 'en' NOT NULL;--> statement-breakpoint
-- The analytics contract gains the story's language, appended last (CREATE OR REPLACE VIEW
-- may only add columns at the end). Same filter as 0013: rows only on a demo or test database.
CREATE OR REPLACE VIEW "analytics"."demos" WITH (security_barrier = true) AS
SELECT
	d."id" AS "demo_id",
	d."household_id",
	d."user_id" AS "visitor_id",
	d."partner_id",
	d."seed",
	d."anchor_on",
	d."created_at",
	d."seeded_at",
	d."expires_at",
	d."locale"
FROM "public"."demos" d
WHERE current_database() ~ '_(demo|test)$';
--> statement-breakpoint
GRANT SELECT ON "analytics"."demos" TO "splinance_analytics_reader";
