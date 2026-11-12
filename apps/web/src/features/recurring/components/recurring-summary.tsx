import type { Currency } from '@splinance/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SegmentedControl } from '@/components/segmented-control';
import { MoneyFlow } from '@/features/transactions/components/money-flow';
import { cn } from '@/lib/utils';
import type { SeriesView } from '../view';

type Basis = 'household' | 'yours';

/**
 * What the recurring payments cost per month, and what recurring income brings: all of
 * them (shared ones in full, plus the viewer's private ones) or the viewer's part. Series
 * gone quiet do not count. The two figures stand next to each other and are never netted:
 * recurring payments are only a part of what a household spends.
 */
export function RecurringSummary({ views, currency }: { views: SeriesView[]; currency: Currency }) {
  const { t } = useTranslation('recurring');
  const [basis, setBasis] = useState<Basis>('household');
  const running = views.filter((view) => view.timing !== 'lapsed');
  const payments = running.filter((view) => view.series.kind === 'expense');
  const income = running.filter((view) => view.series.kind === 'income');
  const total = (list: SeriesView[]) =>
    list.reduce(
      (sum, view) => sum + (basis === 'household' ? view.series.monthlyAmount : view.yourMonthly),
      0,
    );

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap gap-x-10 gap-y-3">
        <Figure
          // Only payments: the page as it was before income could be tracked.
          label={income.length > 0 ? t('summary.out') : t('summary.about')}
          minor={total(payments)}
          currency={currency}
          count={t('summary.payments', { count: payments.length })}
        />
        {income.length > 0 && (
          <Figure
            label={t('summary.in')}
            minor={total(income)}
            currency={currency}
            count={t('summary.sources', { count: income.length })}
            positive
          />
        )}
      </div>
      <SegmentedControl<Basis>
        label={t('summary.count')}
        value={basis}
        onChange={setBasis}
        options={[
          { value: 'household', label: t('summary.household') },
          { value: 'yours', label: t('summary.yours') },
        ]}
        className="w-auto sm:w-56"
      />
    </div>
  );
}

function Figure({
  label,
  minor,
  currency,
  count,
  positive = false,
}: {
  label: string;
  minor: number;
  currency: Currency;
  count: string;
  positive?: boolean;
}) {
  const { t } = useTranslation('recurring');
  return (
    <div>
      <p className="text-muted-foreground text-sm">{label}</p>
      <p
        className={cn(
          'font-heading text-2xl font-semibold tabular-nums',
          positive && 'text-positive',
        )}
      >
        <MoneyFlow minor={minor} currency={currency} />
        <span className="text-muted-foreground font-sans text-base font-normal">
          {t('summary.perMonth')}
        </span>
      </p>
      <p className="text-muted-foreground text-xs">{count}</p>
    </div>
  );
}
