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
