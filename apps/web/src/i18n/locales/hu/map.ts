import type { en } from '../en';
import type { Messages } from '../../types';

// Amounts and names stand after a colon or in brackets, so no suffix depends on them.
export const map: Messages<typeof en.map> = {
  view: {
    label: 'Áttekintés nézete',
    cards: 'Kártyák',
    map: 'Térkép',
  },
  canvas: 'A háztartás térképe',
  hint: 'Kattints egy kártyára a megnyitásához. Húzd magad valakire az elszámoláshoz, vagy ejts a térképre egy banki exportot az importáláshoz.',
  drop: 'Engedd el a banki exportot az importáláshoz',
  add: {
    label: 'Hozzáadás',
    transaction: 'Tranzakció',
    import: 'Banki import',
    recurring: 'Rendszeres fizetés',
    budget: 'Keret',
    settle: 'Elszámolás',
    invite: 'Tag meghívása',
  },
  you: '{{name}} (te)',
  household: {
    members_one: '{{count}} tag',
    members_other: '{{count}} tag',
  },
  member: {
    youOwed: 'Jár neked: {{amount}}',
    youOwe: 'Tartozol: {{amount}}',
    owed: 'Jár neki: {{amount}}',
    owes: 'Tartozik: {{amount}}',
    settled: 'Nincs tartozás',
    left: 'Kilépett a háztartásból',
  },
  sources: {
    revolut: 'Revolut',
    kh: 'K&H',
  },
  bank: {
    today: 'Ma importálva',
    days_one: '{{count}} napja importálva',
    days_other: '{{count}} napja importálva',
  },
  recurring: {
    private: 'Csak te látod',
    more_one: 'Még {{count}} fizetés',
    more_other: 'Még {{count}} fizetés',
    moreHint: 'A Rendszeres oldalon',
  },
  budget: {
    title: '{{category}} · keret',
    unknown: 'Keret',
  },
  invite: {
    title: 'Függő meghívó',
    expires: 'Lejár: {{when}}',
  },
};
