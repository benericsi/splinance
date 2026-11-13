export const calendar = {
  title: 'Calendar',
  pageTitle: 'Calendar · {{household}}',
  whose: 'Whose spending',
  household: 'Household',
  yourShare: 'Your share',
  /** Phones: the switch between the list and the calendar of the same month. */
  switch: {
    label: 'View',
    list: 'List',
    calendar: 'Calendar',
  },
  category: {
    label: 'Category',
    all: 'All categories',
  },
  stats: {
    spent: 'Spent',
    youSpent: 'You spent',
    toCome: 'Still to come',
    budgetLeft: 'Budget left',
    overBudget: 'Over budget',
    income: 'Income',
    yourIncome: 'Your income',
    days: 'Days with spending',
    dayCount_one: '{{count}} day',
    dayCount_other: '{{count}} days',
    /** "vs 1–11 Oct": the same days of the month before. */
    compare: 'vs {{period}}',
    period: '1–{{day}} {{month}}',
    nothingThen: 'Nothing then',
  },
  /** The overview's card: the viewer's income against what went out and what still will. */
  left: {
    title: 'Left this month',
    overTitle: 'Over this month',
    month: 'See the month',
    perDay_one: 'Today is the last day of the month',
    perDay_other: 'About {{amount}} a day for {{count}} days',
    /** While income is still on its way: "Includes Salary: 690 000 Ft expected 10 Nov". */
    awaiting: 'Includes {{name}}: {{amount}} expected {{date}}',
    overNote: '{{amount}} of payments still to come',
    /** The parts of the month under the number. */
    chips: {
      spent: 'Spent',
      setAside: 'Set aside',
      toCome: 'To come',
    },
    how: 'How is this calculated',
    rows: {
      received: 'Income received',
      expectedIncome: 'Income still expected',
      spent: 'Spent so far',
      setAside: 'Set aside in savings',
      takenOut: 'Taken out of savings',
      toCome_one: 'Recurring still to come · {{count}} payment',
      toCome_other: 'Recurring still to come · {{count}} payments',
    },
    note: 'Your share only. Your bank balance is not counted; what you record in savings goals is.',
    nudge: {
      title: 'See what is left each month',
      text: 'Track your salary and this card shows what you can still spend.',
      action: 'Add income',
      hide: 'Hide',
    },
    /** Income is tracked, but none has arrived or is expected this month. */
    waiting: {
      title: 'No income yet this month',
      text: 'Your tracked income has not shown up yet. Add it by hand or import your bank export, and this card shows what is left.',
      action: 'Add transaction',
    },
  },
  grid: {
    label: 'Days of {{month}}',
  },
  day: {
    /** Read out for a day: "Saturday 10 October, spent 13 000 Ft, 2 events". */
    label: '{{date}}, {{details}}',
    today: 'today',
    spent: 'spent {{amount}}',
    events_one: '{{count}} event',
    events_other: '{{count}} events',
    nothing: 'nothing',
    more: '+{{count}} more',
  },
  event: {
    paid: 'Recurring payment',
    expected: 'Expected',
    received: 'Recurring income',
    expectedIncome: 'Expected income',
    settlement: 'Settle-up',
    about: 'about {{amount}}',
    paidYou: '{{name}} paid you',
    youPaid: 'You paid {{name}}',
    paidOther: '{{from}} paid {{to}}',
  },
  legend: {
    label: 'What the marks mean',
    paid: 'Recurring, paid',
    expected: 'Expected',
    income: 'Recurring income',
    settlement: 'Settle-up',
    spending: 'Darker days: more spent',
  },
  dialog: {
    marked: 'Recurring and settle-ups',
    transactions: 'Transactions',
    spent: 'Spent {{amount}}',
    empty: 'Nothing on this day.',
    emptyAhead: 'Nothing expected on this day.',
  },
};
