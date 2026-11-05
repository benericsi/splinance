import { DEFAULT_LOCALE, type Locale } from './locales';

/**
 * Messages of the shared schemas, in every UI language. The schemas resolve them when they
 * validate (`{ error: () => ... }`), not when they are created, so the web can switch the
 * language at runtime (`setValidationLocale`) while the API keeps English, the language of
 * its error responses and logs. A message with a number takes it as `n`.
 */
const en = {
  'currentPassword.required': 'Enter your current password',
  'email.invalid': 'Enter a valid email address',
  'email.tooLong': 'Email is too long',
  'password.required': 'Password is required',
  'password.tooShort': (n: number) => `Password must be at least ${String(n)} characters`,
  'password.tooLong': (n: number) => `Password must be at most ${String(n)} characters`,
  'password.personal': 'Password must not contain your email or name',
  'password.common': 'This password is too common, choose another one',
  'passwordRule.minLength': (n: number) => `At least ${String(n)} characters`,
  'passwordRule.notPersonal': 'Does not contain your email or name',
  'passwordRule.notCommon': 'Not a commonly used password',
  'passwordRule.lowercase': 'A lowercase letter',
  'passwordRule.uppercase': 'An uppercase letter',
  'passwordRule.number': 'A number',
  'displayName.required': 'Display name is required',
  'displayName.tooLong': (n: number) => `Display name must be at most ${String(n)} characters`,
  'name.required': 'Name is required',
  'name.tooLong': (n: number) => `Name must be at most ${String(n)} characters`,
  nothingToUpdate: 'Nothing to update',
  'invite.invalidToken': 'Invalid invite token',
  'amount.whole': 'Amount must be a whole number of minor units',
  'amount.positive': 'Amount must be greater than zero',
  'amount.tooLarge': 'Amount is too large',
  'note.tooLong': (n: number) => `Note must be at most ${String(n)} characters`,
  'settlement.samePerson': 'Choose two different people',
  'text.min': (n: number) => `Enter at least ${String(n)} characters`,
  'text.max': (n: number) => `Keep it under ${String(n)} characters`,
  'pattern.letters': 'Enter at least 2 letters or digits',
  'recurring.invalidKey': 'Not a recurring key',
  'recurring.startsAfterAnchor': 'The first payment cannot be after this date',
  'report.order': '`from` must not be after `to`',
  'report.tooLong': (n: number) => `At most ${String(n)} months`,
  'date.invalid': 'Enter a valid date',
  'date.range': 'Enter a date between 2000 and 2099',
  'month.format': 'Use YYYY-MM',
  'description.required': 'Description is required',
  'description.tooLong': (n: number) => `Description must be at most ${String(n)} characters`,
  'split.no-members': 'Choose at least one person',
  'split.duplicate-member': 'Each person can appear only once',
  'split.invalid-value': 'Every share must be greater than zero',
  'split.percentage-total': 'Percentages must add up to 100%',
  'split.fixed-total': 'Amounts must add up to the total',
};

export type ValidationKey = keyof typeof en;
type Catalog = { [K in ValidationKey]: (typeof en)[K] };

const hu: Catalog = {
  'currentPassword.required': 'Add meg a jelenlegi jelszavad',
  'email.invalid': 'Adj meg egy érvényes e-mail-címet',
  'email.tooLong': 'Az e-mail-cím túl hosszú',
  'password.required': 'Add meg a jelszavad',
  'password.tooShort': (n) => `A jelszó legalább ${String(n)} karakter legyen`,
  'password.tooLong': (n) => `A jelszó legfeljebb ${String(n)} karakter lehet`,
  'password.personal': 'A jelszó nem tartalmazhatja az e-mail-címed vagy a neved',
  'password.common': 'Ez a jelszó túl gyakori, válassz másikat',
  'passwordRule.minLength': (n) => `Legalább ${String(n)} karakter`,
  'passwordRule.notPersonal': 'Nem tartalmazza az e-mail-címed vagy a neved',
  'passwordRule.notCommon': 'Nem gyakran használt jelszó',
  'passwordRule.lowercase': 'Kisbetű',
  'passwordRule.uppercase': 'Nagybetű',
  'passwordRule.number': 'Számjegy',
  'displayName.required': 'Add meg a neved',
  'displayName.tooLong': (n) => `A név legfeljebb ${String(n)} karakter lehet`,
  'name.required': 'Add meg a nevet',
  'name.tooLong': (n) => `A név legfeljebb ${String(n)} karakter lehet`,
  nothingToUpdate: 'Nincs mit módosítani',
  'invite.invalidToken': 'Érvénytelen meghívó',
  'amount.whole': 'Az összeg csak egész szám lehet',
  'amount.positive': 'Az összeg legyen nagyobb nullánál',
  'amount.tooLarge': 'Az összeg túl nagy',
  'note.tooLong': (n) => `A megjegyzés legfeljebb ${String(n)} karakter lehet`,
  'settlement.samePerson': 'Válassz két különböző személyt',
  'text.min': (n) => `Írj legalább ${String(n)} karaktert`,
  'text.max': (n) => `Legfeljebb ${String(n)} karakter lehet`,
  'pattern.letters': 'Írj legalább 2 betűt vagy számjegyet',
  'recurring.invalidKey': 'Érvénytelen kulcs',
  'recurring.startsAfterAnchor': 'Az első fizetés nem lehet ennél a dátumnál későbbi',
  'report.order': 'A kezdő hónap nem lehet a záró után',
  'report.tooLong': (n) => `Legfeljebb ${String(n)} hónap`,
  'date.invalid': 'Adj meg egy érvényes dátumot',
  'date.range': 'Adj meg egy 2000 és 2099 közötti dátumot',
  'month.format': 'ÉÉÉÉ-HH formátumot használj',
  'description.required': 'Add meg a leírást',
  'description.tooLong': (n) => `A leírás legfeljebb ${String(n)} karakter lehet`,
  'split.no-members': 'Válassz legalább egy személyt',
  'split.duplicate-member': 'Mindenki csak egyszer szerepelhet',
  'split.invalid-value': 'Minden rész legyen nagyobb nullánál',
  'split.percentage-total': 'A százalékok összege 100% legyen',
  'split.fixed-total': 'Az összegek adják ki a teljes összeget',
};

export const VALIDATION_MESSAGES: Record<Locale, Catalog> = { en, hu };

let current: Locale = DEFAULT_LOCALE;

/** The web calls this whenever the UI language changes; the API never does (English). */
export function setValidationLocale(locale: Locale): void {
  current = locale;
}

export const getValidationLocale = (): Locale => current;

type KeyWithNumber = {
  [K in ValidationKey]: (typeof en)[K] extends (n: number) => string ? K : never;
}[ValidationKey];
type KeyWithoutNumber = Exclude<ValidationKey, KeyWithNumber>;

/** The message in the current language. */
export function vm(key: KeyWithoutNumber): string;
export function vm(key: KeyWithNumber, n: number): string;
export function vm(key: ValidationKey, n = 0): string {
  const message: string | ((n: number) => string) = VALIDATION_MESSAGES[current][key];
  return typeof message === 'function' ? message(n) : message;
}

/** Zod params whose message is resolved at validation time: `.min(1, msg('name.required'))`. */
export function msg(key: KeyWithoutNumber): { error: () => string };
export function msg(key: KeyWithNumber, n: number): { error: () => string };
export function msg(key: ValidationKey, n = 0): { error: () => string } {
  return { error: () => vm(key as KeyWithNumber, n) };
}
