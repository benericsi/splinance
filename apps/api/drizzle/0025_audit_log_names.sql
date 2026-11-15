-- Data migration: audit snapshots keep ids only. Until now `before` and `after` held each
-- person's display name as it was then; history now reads names from `users`, so an erased
-- account ("Former member") leaves no copy of its name behind. Blanks every name in the
-- snapshots written before. Idempotent: rows with only blank names are not touched.
UPDATE "audit_log"
SET "before" = jsonb_set(
	jsonb_set(
		jsonb_set("before", '{paidBy,displayName}', '""'),
		'{createdBy,displayName}', '""'
	),
	'{split}',
	CASE
		WHEN jsonb_typeof("before" -> 'split') = 'object' THEN jsonb_set(
			"before" -> 'split',
			'{shares}',
			coalesce(
				(
					SELECT jsonb_agg(s.share || '{"displayName": ""}' ORDER BY s.ord)
					FROM jsonb_array_elements("before" #> '{split,shares}') WITH ORDINALITY AS s(share, ord)
				),
				'[]'
			)
		)
		ELSE "before" -> 'split'
	END
)
WHERE "entity" = 'transaction'
	AND jsonb_path_exists("before", '$.**.displayName ? (@ != "")');
--> statement-breakpoint
UPDATE "audit_log"
SET "after" = jsonb_set(
	jsonb_set(
		jsonb_set("after", '{paidBy,displayName}', '""'),
		'{createdBy,displayName}', '""'
	),
	'{split}',
	CASE
		WHEN jsonb_typeof("after" -> 'split') = 'object' THEN jsonb_set(
			"after" -> 'split',
			'{shares}',
			coalesce(
				(
					SELECT jsonb_agg(s.share || '{"displayName": ""}' ORDER BY s.ord)
					FROM jsonb_array_elements("after" #> '{split,shares}') WITH ORDINALITY AS s(share, ord)
				),
				'[]'
			)
		)
		ELSE "after" -> 'split'
	END
)
WHERE "entity" = 'transaction'
	AND jsonb_path_exists("after", '$.**.displayName ? (@ != "")');
--> statement-breakpoint
UPDATE "audit_log"
SET "before" = jsonb_set(
	jsonb_set(
		jsonb_set("before", '{from,displayName}', '""'),
		'{to,displayName}', '""'
	),
	'{createdBy,displayName}', '""'
)
WHERE "entity" = 'settlement'
	AND jsonb_path_exists("before", '$.**.displayName ? (@ != "")');
--> statement-breakpoint
UPDATE "audit_log"
SET "after" = jsonb_set(
	jsonb_set(
		jsonb_set("after", '{from,displayName}', '""'),
		'{to,displayName}', '""'
	),
	'{createdBy,displayName}', '""'
)
WHERE "entity" = 'settlement'
	AND jsonb_path_exists("after", '$.**.displayName ? (@ != "")');
