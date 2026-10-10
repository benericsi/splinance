import {
  allocate,
  type Currency,
  PERCENT_SCALE,
  type SplitMethod,
  type TransactionKind,
} from '@splinance/shared';
import { useState } from 'react';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ShareRow } from '../form';
import {
  formatMoney,
  formatPercentInput,
  parseAmount,
  parsePercent,
  sanitizePercentInput,
} from '../money';
import { ShareAmountInput } from './amount-inputs';

const METHODS = [
  { value: 'equal', label: 'Equally' },
  { value: 'percentage', label: 'Percent' },
  { value: 'fixed', label: 'Amounts' },
] as const;

interface SplitEditorProps {
  currency: Currency;
  kind: TransactionKind;
  /** Parsed total, undefined while the amount field cannot be read. */
  amount: number | undefined;
  viewerId: string;
  paidBy: string;
  splitMethod: SplitMethod;
  shares: ShareRow[];
  /** Shown after a submit attempt. */
  error: string | undefined;
  onPaidByChange: (userId: string) => void;
  onMethodChange: (method: SplitMethod) => void;
  onSharesChange: (shares: ShareRow[]) => void;
}

/** User ids in the order the API hands out leftover units (see the API's toSortedSpec). */
const byUserId = (a: ShareRow, b: ShareRow) =>
  a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;

/** Each included person's share as the API will compute it, if it can be computed yet. */
function previewShares(
  props: Pick<SplitEditorProps, 'amount' | 'splitMethod' | 'shares' | 'currency'>,
) {
  const { amount, splitMethod, currency } = props;
  const included = props.shares.filter((row) => row.included).sort(byUserId);
  const result = new Map<string, number>();
  if (amount === undefined || included.length === 0) return result;

  if (splitMethod === 'fixed') {
    for (const row of included) {
      const value = parseAmount(row.amount, currency);
      if (value !== undefined) result.set(row.userId, value);
    }
    return result;
  }
  const weights = included.map((row) =>
    splitMethod === 'equal' ? 1 : (parsePercent(row.percent) ?? 0),
  );
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  if (splitMethod === 'percentage' && weightSum !== PERCENT_SCALE) return result;
  allocate(amount, weights).forEach((share, i) => {
    const row = included[i];
    if (row) result.set(row.userId, share);
  });
  return result;
}

/** "3 % left to assign", "500 Ft too much", or undefined when it adds up. */
function remainderHint(
  props: Pick<SplitEditorProps, 'amount' | 'splitMethod' | 'shares' | 'currency'>,
) {
  const included = props.shares.filter((row) => row.included);
  if (props.splitMethod === 'percentage') {
    const left =
      PERCENT_SCALE - included.reduce((sum, row) => sum + (parsePercent(row.percent) ?? 0), 0);
    if (left === 0) return undefined;
    return left > 0
      ? `${formatPercentInput(left)} % left to assign`
      : `${formatPercentInput(-left)} % too much`;
  }
  if (props.splitMethod === 'fixed' && props.amount !== undefined) {
    const left =
      props.amount -
      included.reduce((sum, row) => sum + (parseAmount(row.amount, props.currency) ?? 0), 0);
    if (left === 0) return undefined;
    return left > 0
      ? `${formatMoney(left, props.currency)} left to assign`
      : `${formatMoney(-left, props.currency)} too much`;
  }
  return undefined;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

/** The collapsed form: "Paid by you · split equally between you and Ben". */
function summarize(props: SplitEditorProps): string {
  const name = (row: Pick<ShareRow, 'userId' | 'displayName'>) =>
    row.userId === props.viewerId ? 'you' : row.displayName;
  const payer = props.shares.find((row) => row.userId === props.paidBy);
  const verb = props.kind === 'income' ? 'Received by' : 'Paid by';
  const included = props.shares.filter((row) => row.included);
  const head = `${verb} ${payer ? name(payer) : 'someone'}`;

  if (included.length === 1 && included[0]) return `${head} · for ${name(included[0])}`;
  if (props.splitMethod === 'equal')
    return `${head} · split equally between ${joinNames(included.map(name))}`;
  if (props.splitMethod === 'percentage') return `${head} · split by percentage`;
  return `${head} · split by amount`;
}

/**
 * Who paid and how a shared transaction is divided. Collapsed to one line for the common
 * case (equal split between everyone); "Change" opens the editor. It stays open while it
 * has an error, and opens by itself for anything but the default.
 */
export function SplitEditor(props: SplitEditorProps) {
  const { currency, splitMethod, shares, error } = props;
  const isDefault =
    splitMethod === 'equal' &&
    shares.every((row) => row.included) &&
    props.paidBy === props.viewerId;
  const [expanded, setExpanded] = useState(!isDefault);
  const open = expanded || error !== undefined;
  const preview = previewShares(props);
  const hint = remainderHint(props);

  if (!open) {
    return (
      <div className="bg-muted/50 flex items-center justify-between gap-3 rounded-lg px-3 py-2.5">
        <p className="min-w-0 text-sm">{summarize(props)}</p>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="text-link h-auto px-0"
          onClick={() => {
            setExpanded(true);
          }}
        >
          Change
        </Button>
      </div>
    );
  }

  const payers = shares.filter((row) => !row.former || row.userId === props.paidBy);
  const setRow = (userId: string, patch: Partial<ShareRow>) => {
    props.onSharesChange(shares.map((row) => (row.userId === userId ? { ...row, ...patch } : row)));
  };

  return (
    <fieldset className="space-y-4 rounded-lg border p-3">
      <legend className="sr-only">Split</legend>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{props.kind === 'income' ? 'Received by' : 'Paid by'}</p>
        <SegmentedControl
          label={props.kind === 'income' ? 'Received by' : 'Paid by'}
          value={props.paidBy}
          onChange={props.onPaidByChange}
          options={payers.map((row) => ({
            value: row.userId,
            label: row.userId === props.viewerId ? 'You' : row.displayName,
          }))}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">Split</p>
        <SegmentedControl
          label="Split method"
          value={splitMethod}
          onChange={props.onMethodChange}
          options={METHODS}
        />
      </div>

      <ul className="space-y-1">
        {shares.map((row) => {
          const label = row.userId === props.viewerId ? 'You' : row.displayName;
          const share = preview.get(row.userId);
          return (
            <li key={row.userId} className="flex min-h-9 items-center gap-3">
              <label className="flex min-w-0 flex-1 items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={row.included}
                  onChange={(e) => {
                    setRow(row.userId, { included: e.target.checked });
                  }}
                  className="accent-primary size-4 shrink-0"
                />
                <span className="truncate">
                  {label}
                  {row.former && <span className="text-muted-foreground"> (left)</span>}
                </span>
              </label>
              {splitMethod === 'percentage' && row.included && (
                <div className="relative w-24 shrink-0">
                  <Input
                    aria-label={`Percent for ${label}`}
                    inputMode="decimal"
                    autoComplete="off"
                    value={row.percent}
                    onChange={(e) => {
                      setRow(row.userId, { percent: sanitizePercentInput(e.target.value) });
                    }}
                    className="h-8 pr-7 text-right tabular-nums"
                  />
                  <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs">
                    %
                  </span>
                </div>
              )}
              {splitMethod === 'fixed' && row.included && (
                <ShareAmountInput
                  label={`Amount for ${label}`}
                  value={row.amount}
                  currency={currency}
                  onChange={(amount) => {
                    setRow(row.userId, { amount });
                  }}
                />
              )}
              {splitMethod !== 'fixed' && (
                <span className="text-muted-foreground w-24 shrink-0 text-right text-sm tabular-nums">
                  {row.included && share !== undefined ? formatMoney(share, currency) : ''}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {(error ?? hint) && (
        <p
          role={error ? 'alert' : undefined}
          className={cn('text-sm', error ? 'text-destructive' : 'text-muted-foreground')}
        >
          {error ?? hint}
        </p>
      )}
    </fieldset>
  );
}
