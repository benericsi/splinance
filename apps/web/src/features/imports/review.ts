import type {
  Category,
  ImportCheckInput,
  ImportCheckResult,
  ImportInput,
  StatementRow,
  StatementSource,
  TransactionVisibility,
} from '@splinance/shared';
import { formatDayHeading } from '@/features/transactions/dates';

/** "Needs a look" first, then what is ready, then what cannot be imported. */
export type ReviewGroup = 'needs-look' | 'ready' | 'left-out';

/** A bank row on the review screen, with what the person chose for it. */
export interface ReviewRow {
  /** Unique on the screen: the fingerprint, or the line for rows without one. */
  key: string;
  row: StatementRow;
  group: ReviewGroup;
  /** Why it is in its group, in words; none for ordinary ready rows. */
  reason: string | undefined;
  included: boolean;
  description: string;
  /** '' for no category. */
  categoryId: string;
  visibility: TransactionVisibility;
}

/** Rows worth asking the API about: identifiable and importable at all. */
export function rowsToCheck(rows: StatementRow[], currency: string): ImportCheckInput['rows'] {
  return rows
    .filter((row) => importable(row, currency))
    .map((row) => ({
      fingerprint: row.fingerprint ?? '',
      occurredOn: row.occurredOn,
      kind: row.kind,
      amount: row.amount,
    }));
}

const importable = (row: StatementRow, currency: string) =>
  row.fingerprint !== null && !row.flags.includes('pending') && row.currency === currency;

function classify(
  row: StatementRow,
  result: ImportCheckResult | undefined,
  currency: string,
): Pick<ReviewRow, 'group' | 'reason'> {
  if (row.flags.includes('pending') || row.fingerprint === null) {
    return { group: 'left-out', reason: 'Not booked yet: it comes in a later export' };
  }
  if (row.currency !== currency) {
    return { group: 'left-out', reason: `In ${row.currency}: other currencies come later` };
  }
  if (result?.status === 'imported') return { group: 'left-out', reason: 'Already imported' };

  if (result?.status === 'possible-duplicate' && result.match) {
    const day = formatDayHeading(result.match.occurredOn);
    return {
      group: 'needs-look',
      reason: `Maybe already added: "${result.match.description}", ${day}`,
    };
  }
  if (result?.status === 'deleted') {
    return { group: 'needs-look', reason: 'You imported this before and deleted it' };
  }
  if (row.flags.includes('own-transfer')) {
    return { group: 'needs-look', reason: 'Looks like a transfer between your own accounts' };
  }
  if (row.flags.includes('cash-withdrawal')) {
    return { group: 'needs-look', reason: 'Cash withdrawal: not spending yet' };
  }
  return { group: 'ready', reason: undefined };
}

/**
 * The review screen's rows: ready ones are picked, private and without a category; the
 * ones that need a look are not picked; the rest cannot be.
 */
export function buildReview(
  rows: StatementRow[],
  results: ImportCheckResult[],
  currency: string,
): ReviewRow[] {
  const byFingerprint = new Map(results.map((result) => [result.fingerprint, result]));
  return rows.map((row) => {
    const { group, reason } = classify(
      row,
      row.fingerprint ? byFingerprint.get(row.fingerprint) : undefined,
      currency,
    );
    return {
      key: row.fingerprint ?? `line:${String(row.line)}`,
      row,
      group,
      reason,
      included: group === 'ready',
      description: row.description,
      categoryId: '',
      visibility: 'private',
    };
  });
}

/** Changes picked rows; `onlyKind` limits it to rows a category of that kind fits. */
export function updatePicked(
  rows: ReviewRow[],
  patch: Partial<Pick<ReviewRow, 'categoryId' | 'visibility'>>,
  onlyKind?: Category['kind'],
): ReviewRow[] {
  return rows.map((review) =>
    review.included && (!onlyKind || review.row.kind === onlyKind)
      ? { ...review, ...patch }
      : review,
  );
}

/**
 * The import request for the picked rows. Shared ones are paid (or received) by the viewer
 * and split equally between the household's members, like a new transaction.
 */
export function toImportInput(
  rows: ReviewRow[],
  {
    source,
    fileName,
    viewerId,
    memberIds,
  }: { source: StatementSource; fileName: string; viewerId: string; memberIds: string[] },
): ImportInput {
  return {
    source,
    fileName: fileName.slice(0, 200) || null,
    rows: rows
      .filter((review) => review.included && review.group !== 'left-out')
      .map(({ row, description, categoryId, visibility }) => {
        const common = {
          kind: row.kind,
          amount: row.amount,
          occurredOn: row.occurredOn,
          description: description.trim() || row.description,
          categoryId: categoryId || null,
        };
        return {
          fingerprint: row.fingerprint ?? '',
          counterparty: row.counterparty?.slice(0, 120) ?? null,
          transaction:
            visibility === 'shared'
              ? {
                  ...common,
                  visibility: 'shared' as const,
                  paidBy: viewerId,
                  split: { method: 'equal' as const, userIds: memberIds },
                }
              : { ...common, visibility: 'private' as const },
        };
      }),
  };
}
