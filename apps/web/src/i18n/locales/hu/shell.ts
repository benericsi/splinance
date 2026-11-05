import type { en } from '../en';
import type { Messages } from '../../types';

export const shell: Messages<typeof en.shell> = {
  accountMenu: 'Fiókmenü',
  demoAccount: 'Demófiók',
  accountSettings: 'Fiókbeállítások',
  logOut: 'Kijelentkezés',
  endDemo: 'Demó befejezése',
  endDemoTitle: 'Befejezed a demót?',
  endDemoDescription: 'Ez végleg törli a demóháztartást. Bármikor indíthatsz újat.',
  ending: 'Befejezés…',
  sections: 'Háztartás részei',
  nav: {
    overview: 'Áttekintés',
    transactions: 'Tranzakciók',
    transactionsShort: 'Tételek',
    budgets: 'Keretek',
    recurring: 'Rendszeres',
    reports: 'Kimutatások',
    settings: 'Beállítások',
  },
};
