import type { en } from '../en';
import type { Messages } from '../../types';

export const calendar: Messages<typeof en.calendar> = {
  title: 'Naptár',
  pageTitle: 'Naptár · {{household}}',
  whose: 'Kinek a költése',
  household: 'Háztartás',
  yourShare: 'A te részed',
  switch: {
    label: 'Nézet',
    list: 'Lista',
    calendar: 'Naptár',
  },
  stats: {
    spent: 'Elköltve',
    youSpent: 'Te költöttél',
    toCome: 'Még várható',
    budgetLeft: 'Keretből maradt',
    overBudget: 'Keret túllépve',
    income: 'Bevétel',
    yourIncome: 'A te bevételed',
  },
  grid: {
    label: 'Napok · {{month}}',
  },
  day: {
    label: '{{date}}, {{details}}',
    today: 'ma',
    spent: 'költés: {{amount}}',
    events_one: '{{count}} esemény',
    events_other: '{{count}} esemény',
    nothing: 'nincs tétel',
    more: '+{{count}} további',
  },
  event: {
    paid: 'Rendszeres fizetés',
    expected: 'Várható',
    settlement: 'Elszámolás',
    about: 'kb. {{amount}}',
    paidYou: '{{name}} fizetett neked',
    youPaid: 'Fizettél neki: {{name}}',
    paidOther: '{{from}} fizetett neki: {{to}}',
  },
  legend: {
    label: 'A jelölések magyarázata',
    paid: 'Rendszeres, kifizetve',
    expected: 'Várható',
    settlement: 'Elszámolás',
    spending: 'Sötétebb nap: több költés',
  },
  dialog: {
    marked: 'Rendszeres tételek és elszámolások',
    transactions: 'Tranzakciók',
    spent: 'Elköltve: {{amount}}',
    empty: 'Ezen a napon nincs tétel.',
    emptyAhead: 'Erre a napra nem várható tétel.',
  },
};
