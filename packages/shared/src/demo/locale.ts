import { DEFAULT_CATEGORIES, defaultCategories } from '../categories';
import type { Locale } from '../i18n/locales';
import type { DemoStory } from './story';

/**
 * What the couple typed, in the visitor's language. Only text people write in the app is
 * translated: merchant names stay, and bank rows keep what the banks printed, so the bank
 * files are the same in every language (a test checks it).
 */
export const DEMO_TEXT: Record<Exclude<Locale, 'en'>, Readonly<Record<string, string>>> = {
  hu: {
    'Doe household': 'Doe család',
    Rent: 'Albérlet',
    'BKK monthly pass': 'BKK havibérlet',
    Salary: 'Fizetés',
    'Electricity and gas': 'Villany és gáz',
    'Phone plan': 'Mobilelőfizetés',
    'Gym membership': 'Edzőterem-bérlet',
    'Farmers market': 'Piac',
    Pharmacy: 'Gyógyszertár',
    'IKEA: shelves and lamps': 'IKEA: polcok és lámpák',
    'Sold the old bike': 'Eladtuk a régi biciklit',
    'Flights to Lisbon': 'Repülőjegy Lisszabonba',
    'Lisbon apartment': 'Szállás Lisszabonban',
    'Birthday present for Mum': 'Szülinapi ajándék anyának',
    'Account fee': 'Számlavezetési díj',
    'Rent share': 'Lakbér része',
    'Settling up': 'Elszámolás',
  },
};

/** The story's category names (English defaults) as the household's defaults in `locale`. */
function categoryNames(locale: Locale): Map<string, string> {
  const names = defaultCategories(locale);
  return new Map(
    DEFAULT_CATEGORIES.map((category, index) => [
      category.name,
      names[index]?.name ?? category.name,
    ]),
  );
}

/** The story in `locale`: typed text and category names; everything else is untouched. */
export function localizeDemoStory(story: DemoStory, locale: Locale): DemoStory {
  if (locale === 'en') return story;
  const words = DEMO_TEXT[locale];
  const text = (value: string) => words[value] ?? value;
  const categories = categoryNames(locale);
  const category = (name: string) => categories.get(name) ?? name;

  return {
    ...story,
    locale,
    householdName: text(story.householdName),
    transactions: story.transactions.map((t) => ({
      ...t,
      description: text(t.description),
      category: t.category === null ? null : category(t.category),
    })),
    settlements: story.settlements.map((s) => ({ ...s, note: text(s.note) })),
    rules: story.rules.map((r) => ({ ...r, category: category(r.category) })),
    budgets: story.budgets.map((b) => ({ ...b, category: category(b.category) })),
    recurring: {
      confirmed: story.recurring.confirmed,
      added: story.recurring.added.map((a) => ({
        ...a,
        name: text(a.name),
        category: category(a.category),
      })),
    },
  };
}
