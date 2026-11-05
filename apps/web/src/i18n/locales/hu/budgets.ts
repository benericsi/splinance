import type { en } from '../en';
import type { Messages } from '../../types';

export const budgets: Messages<typeof en.budgets> = {
  title: 'Keretek',
  pageTitle: 'Keretek · {{household}}',
  set: 'Új keret',
  setFirst: 'Keret beállítása',
  empty: {
    title: 'Nincs keret · {{month}}',
    description:
      'Adj egy kategóriának havi keretet, és lásd, hogyan áll hozzá a közös költés. Minden hónapra érvényes, amíg meg nem változtatod.',
  },
  totals: {
    budgeted: 'Keret',
    spent: 'Elköltve',
    left: 'Maradt',
    over: 'Túllépve',
  },
  note: {
    left: 'Maradt: {{amount}}',
    over: 'Túllépve: {{amount}}',
  },
  unknown: 'Ismeretlen',
  sharedOnly: 'Csak a közös kiadások számítanak. A csak saját tételek kimaradnak a keretekből.',
  alerts: {
    title: 'E havi keretek',
    all: 'Összes keret',
  },
  dialog: {
    setTitle: 'Keret beállítása',
    changeTitle: 'Keret módosítása',
    category: 'Kategória',
    chooseCategory: 'Válassz kategóriát',
    everyMonth: 'Havonta',
    from: '{{month}} hónaptól. A korábbi hónapok megtartják a sajátjukat.',
    remove: 'Keret törlése',
    saved: 'Keret mentve',
    removed: 'Keret törölve',
  },
};
