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
    overviewShort: 'Főoldal',
    transactions: 'Tranzakciók',
    transactionsShort: 'Tételek',
    budgets: 'Keretek',
    recurring: 'Rendszeres',
    recurringShort: 'Díjak',
    reports: 'Kimutatások',
    reportsShort: 'Elemzés',
    settings: 'Beállítások',
    settingsShort: 'Opciók',
  },
};
