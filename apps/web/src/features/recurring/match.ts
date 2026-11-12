import {
  AMOUNT_TOLERANCE,
  matchKey,
  type RecurringRow,
  type RecurringSeries,
  seriesCovers,
  VARYING_AMOUNT_TOLERANCE,
  withinTolerance,
} from '@splinance/shared';

/**
 * The series a row being imported will count for, as the API will decide it: shared series
 * first, then the viewer's own, longer patterns before shorter ones, and the amount within
 * the tolerance of the series' latest payment.
 */
export function seriesForRow(
  series: RecurringSeries[],
  row: Pick<
    RecurringRow,
    'kind' | 'visibility' | 'amount' | 'occurredOn' | 'counterparty' | 'description'
  >,
  viewerId: string,
): RecurringSeries | undefined {
  const ranked = [...series].sort(
    (a, b) =>
      Number(a.scope === 'private') - Number(b.scope === 'private') ||
      matchKey(b.pattern).length - matchKey(a.pattern).length,
  );
  const subject: RecurringRow = { ...row, id: '', createdBy: viewerId, categoryId: null };
  return ranked.find(
    (item) =>
      seriesCovers(
        {
          id: item.id,
          kind: item.kind,
          ownerId: item.scope === 'private' ? viewerId : null,
          pattern: item.pattern,
          amount: item.latestAmount,
          amountVaries: item.amountVaries,
          startsOn: item.startsOn,
        },
        subject,
      ) &&
      withinTolerance(
        row.amount,
        item.latestAmount,
        item.amountVaries ? VARYING_AMOUNT_TOLERANCE : AMOUNT_TOLERANCE,
      ),
  );
}
