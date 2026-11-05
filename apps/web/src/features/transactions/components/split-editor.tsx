import {
  allocate,
  type Currency,
  PERCENT_SCALE,
  type SplitMethod,
  type TransactionKind,
} from '@splinance/shared';
import { AnimatePresence, m } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { i18n } from '@/i18n';
import { intlLocale } from '@/lib/locale';
import { COLLAPSE, TRANSITION_FAST } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { forPerson } from '../describe';
import type { ShareRow } from '../form';
import {
  formatMoney,
  formatPercentInput,
  parseAmount,
  parsePercent,
  sanitizePercentInput,
} from '../money';
import { ShareAmountInput } from './amount-inputs';

const METHODS = ['equal', 'percentage', 'fixed'] as const;

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
      ? i18n.t('transactions:split.left', { value: `${formatPercentInput(left)} %` })
      : i18n.t('transactions:split.over', { value: `${formatPercentInput(-left)} %` });
  }
  if (props.splitMethod === 'fixed' && props.amount !== undefined) {
    const left =
      props.amount -
      included.reduce((sum, row) => sum + (parseAmount(row.amount, props.currency) ?? 0), 0);
    if (left === 0) return undefined;
    return left > 0
      ? i18n.t('transactions:split.left', { value: formatMoney(left, props.currency) })
      : i18n.t('transactions:split.over', { value: formatMoney(-left, props.currency) });
  }
  return undefined;
}

const lists = new Map<string, Intl.ListFormat>();

/** "you and Ben", "Anna, Ben and you" / "te és Ben", in the UI language. */
function joinNames(names: string[]): string {
  const locale = intlLocale();
  let list = lists.get(locale);
  if (!list) {
    list = new Intl.ListFormat(locale, { type: 'conjunction' });
    lists.set(locale, list);
  }
  return list.format(names);
}

/** The collapsed form: "Paid by you · split equally between you and Ben". */
function summarize(props: SplitEditorProps): string {
  const name = (row: Pick<ShareRow, 'userId' | 'displayName'>) =>
    row.userId === props.viewerId ? i18n.t('transactions:split.you') : row.displayName;
  const payer = props.shares.find((row) => row.userId === props.paidBy);
  const income = props.kind === 'income';
  let head: string;
  if (payer?.userId === props.viewerId) {
    head = income
      ? i18n.t('transactions:split.receivedByYou')
      : i18n.t('transactions:split.paidByYou');
  } else {
    const payerName = payer ? payer.displayName : i18n.t('transactions:split.someone');
    head = income
      ? i18n.t('transactions:split.receivedBy', { name: payerName })
      : i18n.t('transactions:split.paidBy', { name: payerName });
  }
  const included = props.shares.filter((row) => row.included);

  if (included.length === 1 && included[0]) {
    return `${head} · ${forPerson(included[0], props.viewerId)}`;
  }
  if (props.splitMethod === 'equal') {
    return `${head} · ${i18n.t('transactions:split.equallyBetween', {
      names: joinNames(included.map(name)),
    })}`;
  }
  if (props.splitMethod === 'percentage') {
    return `${head} · ${i18n.t('transactions:split.byPercentage')}`;
  }
  return `${head} · ${i18n.t('transactions:split.byAmount')}`;
}

/**
 * Who paid and how a shared transaction is divided. Collapsed to one line for the common
 * case (equal split between everyone); "Change" opens the editor. It stays open while it
 * has an error, and opens by itself for anything but the default.
 */
export function SplitEditor(props: SplitEditorProps) {
  const { t } = useTranslation('transactions');
  const { currency, splitMethod, shares, error } = props;
  const isDefault =
    splitMethod === 'equal' &&
    shares.every((row) => row.included) &&
    props.paidBy === props.viewerId;
  const [expanded, setExpanded] = useState(!isDefault);
  const open = expanded || error !== undefined;
  const preview = previewShares(props);
  const hint = remainderHint(props);

  const summary = (
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
        {t('split.change')}
      </Button>
    </div>
  );

  const payerLabel = props.kind === 'income' ? t('split.receivedByLabel') : t('split.paidByLabel');
  const payers = shares.filter((row) => !row.former || row.userId === props.paidBy);
  const setRow = (userId: string, patch: Partial<ShareRow>) => {
    props.onSharesChange(shares.map((row) => (row.userId === userId ? { ...row, ...patch } : row)));
  };

  const editor = (
    <fieldset className="space-y-4 rounded-lg border p-3">
      <legend className="sr-only">{t('split.label')}</legend>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{payerLabel}</p>
        <SegmentedControl
          label={payerLabel}
          value={props.paidBy}
          onChange={props.onPaidByChange}
          options={payers.map((row) => ({
            value: row.userId,
            label: row.userId === props.viewerId ? t('you') : row.displayName,
          }))}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t('split.label')}</p>
        <SegmentedControl
          label={t('split.method')}
          value={splitMethod}
          onChange={props.onMethodChange}
          options={METHODS.map((method) => ({ value: method, label: t(`split.${method}`) }))}
        />
      </div>

      <ul className="space-y-1">
        {shares.map((row) => {
          const label = row.userId === props.viewerId ? t('you') : row.displayName;
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
                  {row.former && (
                    <span className="text-muted-foreground"> {t('split.former')}</span>
                  )}
                </span>
              </label>
              {splitMethod === 'percentage' && row.included && (
                <div className="relative w-24 shrink-0">
                  <Input
                    aria-label={
                      row.userId === props.viewerId
                        ? t('split.percentForYou')
                        : t('split.percentFor', { name: label })
                    }
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
                  label={
                    row.userId === props.viewerId
                      ? t('split.amountForYou')
                      : t('split.amountFor', { name: label })
                  }
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

  // The summary line opens into the editor (and back) by height, one after the other.
  return (
    <AnimatePresence initial={false} mode="wait">
      <m.div key={open ? 'editor' : 'summary'} {...COLLAPSE} transition={TRANSITION_FAST}>
        {open ? editor : summary}
      </m.div>
    </AnimatePresence>
  );
}
