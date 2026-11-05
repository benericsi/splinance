import type { en } from '../en';
import type { Messages } from '../../types';

// Sentence shapes avoid suffixes after names and amounts ("Tartozol neki: Ben"), which
// would depend on the name's last sound.
export const balances: Messages<typeof en.balances> = {
  overview: {
    morning: 'Jó reggelt, {{name}}!',
    afternoon: 'Szép napot, {{name}}!',
    evening: 'Jó estét, {{name}}!',
    members: 'Tagok',
  },
  heading: 'Egyenleg',
  settleUp: 'Elszámolás',
  alsoIn: 'További egyenlegek · {{household}}',
  viewTransactions: 'Tranzakciók',
  allSquare: 'Kvittek vagytok',
  alone: 'Az egyenlegek itt jelennek meg, amint valakivel közösen költesz.',
  othersOwe: 'Senkinek sem tartozol, és neked sem tartozik senki.',
  nobodyOwes: 'Senki nem tartozik senkinek · {{household}}',
  debt: {
    owesYou: '{{name}} tartozik neked',
    youOwe: 'Tartozol neki: {{name}}',
    owes: '{{from}} tartozik neki: {{to}}',
  },
  payment: {
    paidYou: '{{name}} fizetett neked',
    youPaid: 'Fizettél neki: {{name}}',
    paid: '{{from}} fizetett neki: {{to}}',
  },
  settle: {
    title: 'Elszámolás',
    nobody:
      'Előbb hívj meg valakit ebbe a háztartásba ({{household}}): a fizetés két ember között történik.',
    recorded: 'Fizetés rögzítve',
    with: 'Kivel',
    whoPaid: 'Ki fizetett',
    owesYou: '{{name}} tartozik neked: {{amount}}',
    youOwe: 'Tartozol neki: {{name}} · {{amount}}',
    square: 'Te és {{name}} kvittek vagytok',
    note: 'Megjegyzés',
    notePlaceholder: 'Készpénz, Revolut',
    outside: 'A Splinance-en kívül történt fizetést rögzíti. Itt nem mozog pénz.',
    submit: 'Fizetés rögzítése',
  },
  after: {
    square: 'Ezzel kvittek lesztek',
    owesYou: '{{name}} tartozik neked: {{amount}}',
    youOwe: 'tartozol neki: {{name}} · {{amount}}',
    overpaid: 'Ez {{amount}} összeggel több a tartozásnál, így {{state}}',
    then: 'Ezután {{state}}',
    stillOwesYou: 'Ezután {{name}} még tartozik neked: {{amount}}',
    stillYouOwe: 'Ezután még tartozol neki: {{name}} · {{amount}}',
  },
  settlements: {
    title: 'Legutóbbi elszámolások',
    deleted: 'Fizetés törölve',
    actions: 'Fizetés műveletei',
  },
};
