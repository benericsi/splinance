import type { en } from '../en';
import type { Messages } from '../../types';

export const common: Messages<typeof en.common> = {
  cancel: 'Mégse',
  close: 'Bezárás',
  closeToast: 'Értesítés bezárása',
  save: 'Mentés',
  saving: 'Mentés…',
  back: 'Vissza',
  backTo: 'Vissza: {{name}}',
  loading: 'Betöltés…',
  loadMore: 'Továbbiak betöltése',
  delete: 'Törlés',
  undo: 'Visszavonás',
  edit: 'Szerkesztés',
  month: {
    previous: 'Előző hónap',
    next: 'Következő hónap',
    current: 'Ez a hónap',
  },
  tryAgain: 'Próbáld újra',
  backHome: 'Vissza a kezdőlapra',
  privacy: 'Adatvédelem',
  language: 'Nyelv',
  tagline: {
    title: 'Közös kiadások, rendben.',
    description: 'Kövessétek, mire költötök együtt, és mindig lássátok, ki kinek tartozik.',
  },
  theme: {
    label: 'Téma',
    light: 'Világos',
    dark: 'Sötét',
    system: 'Rendszer',
  },
  password: {
    show: 'Jelszó megjelenítése',
    hide: 'Jelszó elrejtése',
    current: 'Jelenlegi jelszó',
    currentPlaceholder: 'A jelenlegi jelszavad',
    requirements: 'Jelszókövetelmények',
    recommendations: 'Jelszójavaslatok',
    stronger: 'Erősebbé teszi',
    met: '(teljesül)',
    notMet: '(nem teljesül)',
  },
  notFound: {
    title: 'Az oldal nem található',
    description: 'A keresett oldal nem létezik, vagy máshová került.',
  },
  error: {
    title: 'Valami hiba történt',
    description:
      'Váratlan hiba történt. Próbáld újra, vagy töltsd újra az oldalt, ha nem múlik el.',
  },
  date: {
    today: 'ma',
    yesterday: 'tegnap',
    todayHeading: 'Ma, {{date}}',
    yesterdayHeading: 'Tegnap, {{date}}',
  },
};
