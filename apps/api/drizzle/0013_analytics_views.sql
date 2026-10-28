-- The data track's read contract (docs/data-model.md, "analytics schema"): views over the
-- tables, readable by one role that can read nothing else. Rules shared by every view:
-- - Empty unless the database is a demo or test one: the lake reads only the demo database.
-- - Free text the story wrote is shown; text a visitor typed is null. A row is "seeded" when
--   its household is a demo's and it was created by the time seeding finished
--   (demos.seeded_at), "untouched" when it has not changed since. Editable text needs both.
-- - Rows never drop out of a view: one that may not be shown (private, or imported by a
--   visitor) stays as a stub with its key and timestamps, so an incremental extract by
--   updated_at sees it change.
-- - security_barrier: a reader's own functions in WHERE run after the view's conditions.
CREATE SCHEMA "analytics";
--> statement-breakpoint
-- Roles belong to the server, not one database, so test, e2e and demo databases share it.
-- The login role that is a member of it is created outside migrations, on the demo only.
DO $$
BEGIN
	IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'splinance_analytics_reader') THEN
		CREATE ROLE "splinance_analytics_reader" NOLOGIN;
	END IF;
EXCEPTION
	-- Another database on the same server created it at the same moment.
	WHEN duplicate_object THEN NULL;
END;
$$;
--> statement-breakpoint
CREATE VIEW "analytics"."households" WITH (security_barrier = true) AS
SELECT
	h."id" AS "household_id",
	CASE WHEN p."untouched" THEN h."name" END AS "name",
	h."base_currency",
	h."created_by",
	h."archived_at",
	h."created_at",
	h."updated_at",
	CASE WHEN p."seeded" THEN 'seeded' ELSE 'visitor' END AS "origin"
FROM "public"."households" h
LEFT JOIN "public"."demos" d ON d."household_id" = h."id"
CROSS JOIN LATERAL (
	SELECT
		coalesce(h."created_at" <= d."seeded_at", false) AS "seeded",
		coalesce(h."updated_at" <= d."seeded_at", false) AS "untouched"
) p
WHERE current_database() ~ '_(demo|test)$';
--> statement-breakpoint
CREATE VIEW "analytics"."members" WITH (security_barrier = true) AS
SELECT
	m."household_id",
	m."user_id",
	m."role",
	m."joined_at",
	m."left_at"
FROM "public"."household_members" m
WHERE current_database() ~ '_(demo|test)$';
--> statement-breakpoint
-- No email, no password hash. Display names only for the made-up demo people.
CREATE VIEW "analytics"."users" WITH (security_barrier = true) AS
SELECT
	u."id" AS "user_id",
	CASE
		WHEN EXISTS (
			SELECT FROM "public"."demos" d WHERE u."id" IN (d."user_id", d."partner_id")
		) THEN u."display_name"
	END AS "display_name",
	u."created_at"
FROM "public"."users" u
WHERE current_database() ~ '_(demo|test)$';
--> statement-breakpoint
CREATE VIEW "analytics"."demos" WITH (security_barrier = true) AS
SELECT
	d."id" AS "demo_id",
	d."household_id",
	d."user_id" AS "visitor_id",
	d."partner_id",
	d."seed",
	d."anchor_on",
	d."created_at",
	d."seeded_at",
	d."expires_at"
FROM "public"."demos" d
WHERE current_database() ~ '_(demo|test)$';
--> statement-breakpoint
CREATE VIEW "analytics"."categories" WITH (security_barrier = true) AS
SELECT
	c."id" AS "category_id",
	c."household_id",
	CASE WHEN p."untouched" THEN c."name" END AS "name",
	c."kind",
	c."icon",
	c."color",
	c."archived_at",
	c."created_at",
	c."updated_at",
	CASE WHEN p."seeded" THEN 'seeded' ELSE 'visitor' END AS "origin"
FROM "public"."categories" c
LEFT JOIN "public"."demos" d ON d."household_id" = c."household_id"
CROSS JOIN LATERAL (
	SELECT
		coalesce(c."created_at" <= d."seeded_at", false) AS "seeded",
		coalesce(c."updated_at" <= d."seeded_at", false) AS "untouched"
) p
WHERE current_database() ~ '_(demo|test)$';
--> statement-breakpoint
CREATE VIEW "analytics"."budgets" WITH (security_barrier = true) AS
SELECT
	b."id" AS "budget_id",
	b."household_id",
	b."category_id",
	b."user_id",
	b."starts_on",
	b."amount",
	b."created_by",
	b."created_at",
	b."updated_at",
	CASE WHEN coalesce(b."created_at" <= d."seeded_at", false) THEN 'seeded' ELSE 'visitor' END
		AS "origin"
FROM "public"."budgets" b
LEFT JOIN "public"."demos" d ON d."household_id" = b."household_id"
WHERE current_database() ~ '_(demo|test)$';
--> statement-breakpoint
-- Stubs: private transactions (readable only by their author, and the pipeline is nobody's
-- author) and transactions a visitor imported (the file may have been a real bank export).
-- Bank text (counterparty, fingerprint) is never edited, so seeded is enough for it.
CREATE VIEW "analytics"."transactions" WITH (security_barrier = true) AS
SELECT
	t."id" AS "transaction_id",
	t."household_id",
	t."visibility",
	s."stub" AS "redacted",
	CASE WHEN p."seeded" THEN 'seeded' ELSE 'visitor' END AS "origin",
	CASE WHEN NOT s."stub" THEN t."kind" END AS "kind",
	CASE WHEN NOT s."stub" THEN t."amount" END AS "amount",
	CASE WHEN NOT s."stub" THEN t."currency" END AS "currency",
	CASE WHEN NOT s."stub" THEN t."occurred_on" END AS "occurred_on",
	CASE WHEN NOT s."stub" THEN t."category_id" END AS "category_id",
	CASE WHEN NOT s."stub" THEN t."split_method" END AS "split_method",
	CASE WHEN NOT s."stub" THEN t."paid_by" END AS "paid_by",
	CASE WHEN NOT s."stub" THEN t."created_by" END AS "created_by",
	CASE WHEN NOT s."stub" THEN t."import_batch_id" END AS "import_batch_id",
	CASE WHEN NOT s."stub" AND p."untouched" THEN t."description" END AS "description",
	CASE WHEN NOT s."stub" AND p."seeded" THEN t."counterparty" END AS "counterparty",
	CASE WHEN NOT s."stub" AND p."seeded" THEN t."import_fingerprint" END AS "import_fingerprint",
	t."version",
	t."deleted_at",
	t."created_at",
	t."updated_at"
FROM "public"."transactions" t
LEFT JOIN "public"."demos" d ON d."household_id" = t."household_id"
CROSS JOIN LATERAL (
	SELECT
		coalesce(t."created_at" <= d."seeded_at", false) AS "seeded",
		coalesce(t."updated_at" <= d."seeded_at", false) AS "untouched"
) p
CROSS JOIN LATERAL (
	SELECT t."visibility" = 'private' OR (t."import_batch_id" IS NOT NULL AND NOT p."seeded")
		AS "stub"
) s
WHERE current_database() ~ '_(demo|test)$';
--> statement-breakpoint
-- A transaction's shares, replaced whole on every edit: an extract takes the set of every
-- transaction whose transaction_updated_at moved. Stubs have none here.
CREATE VIEW "analytics"."transaction_splits" WITH (security_barrier = true) AS
SELECT
	ts."transaction_id",
	ts."household_id",
	ts."user_id",
	ts."amount",
	ts."basis_points",
	t."updated_at" AS "transaction_updated_at",
	t."occurred_on"
FROM "public"."transaction_splits" ts
JOIN "analytics"."transactions" t ON t."transaction_id" = ts."transaction_id"
WHERE NOT t."redacted";
--> statement-breakpoint
CREATE VIEW "analytics"."settlements" WITH (security_barrier = true) AS
SELECT
	st."id" AS "settlement_id",
	st."household_id",
	st."from_user_id",
	st."to_user_id",
	st."amount",
	st."currency",
	st."settled_on",
	CASE WHEN p."untouched" THEN st."note" END AS "note",
	st."created_by",
	st."deleted_at",
	st."created_at",
	st."updated_at",
	CASE WHEN p."seeded" THEN 'seeded' ELSE 'visitor' END AS "origin"
FROM "public"."settlements" st
LEFT JOIN "public"."demos" d ON d."household_id" = st."household_id"
CROSS JOIN LATERAL (
	SELECT
		coalesce(st."created_at" <= d."seeded_at", false) AS "seeded",
		coalesce(st."updated_at" <= d."seeded_at", false) AS "untouched"
) p
WHERE current_database() ~ '_(demo|test)$';
--> statement-breakpoint
-- No file name (whatever the visitor's file was called). Batches have no updated_at; an
-- undo is their only change, hence changed_at.
CREATE VIEW "analytics"."import_batches" WITH (security_barrier = true) AS
SELECT
	ib."id" AS "import_batch_id",
	ib."household_id",
	ib."created_by",
	ib."source",
	ib."row_count",
	ib."undone_at",
	ib."created_at",
	greatest(ib."created_at", ib."undone_at") AS "changed_at",
	CASE WHEN coalesce(ib."created_at" <= d."seeded_at", false) THEN 'seeded' ELSE 'visitor' END
		AS "origin"
FROM "public"."import_batches" ib
LEFT JOIN "public"."demos" d ON d."household_id" = ib."household_id"
WHERE current_database() ~ '_(demo|test)$';
--> statement-breakpoint
GRANT USAGE ON SCHEMA "analytics" TO "splinance_analytics_reader";
--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA "analytics" TO "splinance_analytics_reader";
