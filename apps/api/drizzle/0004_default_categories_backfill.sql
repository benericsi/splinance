-- Data migration: households created before categories existed get the default set.
-- Mirrors DEFAULT_CATEGORIES in packages/shared/src/categories.ts as it was when this ran;
-- households created later get the defaults from the API.
INSERT INTO "categories" ("household_id", "name", "kind", "icon", "color")
SELECT h."id", d."name", d."kind"::"category_kind", d."icon", d."color"
FROM "households" h
CROSS JOIN (
	VALUES
		('Groceries', 'expense', 'shopping-cart', 'green'),
		('Housing', 'expense', 'house', 'blue'),
		('Utilities', 'expense', 'zap', 'mustard'),
		('Eating out', 'expense', 'utensils', 'orange'),
		('Transport', 'expense', 'bus', 'sky'),
		('Health', 'expense', 'heart-pulse', 'red'),
		('Shopping', 'expense', 'shopping-bag', 'pink'),
		('Entertainment', 'expense', 'film', 'blue'),
		('Travel', 'expense', 'plane', 'sky'),
		('Other', 'expense', 'tag', 'cream'),
		('Salary', 'income', 'briefcase', 'green'),
		('Other income', 'income', 'banknote', 'mustard')
) AS d("name", "kind", "icon", "color")
WHERE NOT EXISTS (SELECT 1 FROM "categories" c WHERE c."household_id" = h."id");
