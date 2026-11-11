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
  install: {
    item: 'Alkalmazás telepítése',
    title: 'A Splinance telepítése',
    description: 'Tedd ki a főképernyőre, és alkalmazásként nyílik meg.',
    share: 'Koppints a böngésző Megosztás gombjára',
    add: 'Válaszd a Főképernyőhöz adás lehetőséget',
  },
  update: {
    title: 'Új verzió érhető el',
    reload: 'Újratöltés',
  },
  nav: {
    overview: 'Áttekintés',
    overviewShort: 'Főoldal',
    transactions: 'Tranzakciók',
    transactionsShort: 'Tételek',
    budgets: 'Keretek',
    calendar: 'Naptár',
    recurring: 'Rendszeres',
    recurringShort: 'Díjak',
    reports: 'Kimutatások',
    reportsShort: 'Elemzés',
    settings: 'Beállítások',
    settingsShort: 'Opciók',
  },
};
