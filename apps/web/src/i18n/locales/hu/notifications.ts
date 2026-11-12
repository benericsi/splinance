import type { en } from '../en';
import type { Messages } from '../../types';

export const notifications: Messages<typeof en.notifications> = {
  title: 'Értesítések',
  unreadLabel: 'Értesítések, {{count}} olvasatlan',
  unread: 'Olvasatlan',
  markAll: 'Mind olvasott',
  empty:
    'Nincs újdonság. Itt jelennek meg a megújulások, a keretfigyelmeztetések és mások módosításai.',
  activity: 'Mások módosításai · {{household}}',
  aPayment: 'Egy fizetés',
  someone: 'Valaki',
  you: 'te',
  someoneLower: 'valaki',
  renewal: {
    today: ' ma megújul',
    tomorrow: ' holnap megújul',
    on: ' megújul: {{day}}',
    soon: ' hamarosan megújul',
    paid: 'Kifizetve',
    missed: ' nem lett kifizetve',
    expected: 'Várható volt: {{date}} Lemondtad?',
    cancelled: 'Lemondtad?',
  },
  income: {
    missed: ' nem érkezett meg',
    expected: 'Várható volt: {{date}} Megszűnt?',
    stopped: 'Megszűnt?',
    up: ' {{percent}}%-kal több érkezett',
    down: ' {{percent}}%-kal kevesebb érkezett',
  },
  price: {
    up: ' ára {{percent}}%-kal nőtt',
    down: ' ára {{percent}}%-kal csökkent',
    change: '{{from}} → {{to}}',
  },
  budget: {
    over: ' túllépte a keretet',
    near: ' a keret {{percent}}%-ánál tart',
    detail: '{{spent}} / {{limit}}',
    detailIn: '{{spent}} / {{limit}} · {{month}}',
  },
  tx: {
    added: ' hozzáadta: {{name}}',
    restored: ' visszaállította: {{name}}',
    changed: ' módosította: {{name}}',
    deleted: ' törölte: {{name}}',
    share: 'A részed: {{amount}}',
    shareChange: 'A részed: {{from}} → {{to}}',
    shareWas: 'A részed ez volt: {{amount}}',
    payer: 'Te fizettél',
    wasPayer: 'Te fizettél',
  },
  import: {
    added_one: ' importált {{count}} közös tranzakciót',
    added_other: ' importált {{count}} közös tranzakciót',
    undone_one: ' visszavonta {{count}} közös tranzakció importálását',
    undone_other: ' visszavonta {{count}} közös tranzakció importálását',
  },
  settlement: {
    recorded: ' rögzített egy fizetést',
    deleted: ' törölt egy fizetést',
    detail: '{{from}} → {{to}}, {{amount}}',
  },
  ago: {
    now: 'most',
    minutes: '{{count}} p',
    hours: '{{count}} ó',
    days: '{{count}} n',
  },
};
