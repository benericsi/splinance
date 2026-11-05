import type { en } from './locales/en';

/** The same keys as English, any text: what every other language must provide. */
export type Messages<T> = { [K in keyof T]: T[K] extends string ? string : Messages<T[K]> };

export type Catalog = Messages<typeof en>;
