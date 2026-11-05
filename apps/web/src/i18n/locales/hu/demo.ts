import type { en } from '../en';
import type { Messages } from '../../types';

export const demo: Messages<typeof en.demo> = {
  pageTitle: 'Próbáld ki',
  title: 'Közös kiadások, rendben.',
  lead: 'Kövesd, mire költ a háztartás, oszd meg igazságosan, és mindig lásd, ki kinek tartozik. Kattints végig egy pár egy évnyi pénzügyein.',
  try: 'Próbáld ki',
  settingUp: 'A háztartásod előkészítése…',
  noSignUp: 'Nem kell regisztrálni. 7 nap után minden törlődik.',
  inTheDemo: 'Mi van a demóban',
  stats: {
    months: { value: '12 hónap', label: 'egy pár közös és saját költése' },
    banks: { value: '2 bank', label: 'Revolut- és K&H-exportok, úgy importálva, ahogy te tennéd' },
    click: { value: '1 kattintás', label: 'nincs regisztráció, nincs mit telepíteni' },
  },
  built: {
    title: 'Hogyan készült',
    description:
      'Egyszemélyes full-stack projekt: típusos API valódi jogosultságkezeléssel és SQL-tranzakciókkal, React-alkalmazás, végponttól végpontig tesztek az éles buildeken, és egy adatfolyam, amely ezt a demót olvassa.',
    technologies: 'Technológiák',
  },
  links: {
    architecture: 'Architektúra és a nehéz részek (angolul)',
    source: 'Forráskód a GitHubon',
    pipeline: 'Az adatfolyam (angolul)',
  },
  madeUp:
    'John és Jane Doe kitalált személyek. Ne írj be semmi személyeset: a demó adatai a törlésükig az adatfolyamba kerülnek.',
  tour: {
    label: 'Körbevezetés az alkalmazásban',
    video:
      'Körbevezetés: a demó indítása, majd az áttekintés, a tranzakciók, a kimutatások és a keretek',
    phone: 'A demó háztartás áttekintése telefonon',
    english: 'A bemutató az angol nyelvű alkalmazást mutatja.',
  },
  banner: {
    label: 'Demó',
    data: 'Demóadatok',
    deleted: 'törlés: {{when}}',
    startOver: 'Újrakezdés',
    startOverTitle: 'Újrakezded?',
    startOverDescription:
      'Ez törli a demó háztartást mindazzal, amit megváltoztattál benne, és egy újat állít be.',
    settingUp: 'Előkészítés…',
  },
  sample: 'Nincs kéznél export? Próbálj ki egy mintát',
};
