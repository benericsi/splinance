import type { Currency } from '@splinance/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SegmentedControl } from '@/components/segmented-control';
import { MoneyFlow } from '@/features/transactions/components/money-flow';
import type { SeriesView } from '../view';

type Basis = 'household' | 'yours';

/**
 * What the recurring payments cost per month: all of them (shared ones in full, plus the
 * viewer's private ones) or the viewer's part. Payments gone quiet do not count, and
 * neither does recurring income: this is money going out.
 */
export function RecurringSummary({ views, currency }: { views: SeriesView[]; currency: Currency }) {
  const { t } = useTranslation('recurring');
  const [basis, setBasis] = useState<Basis>('household');
  const running = views.filter(
    (view) => view.timing !== 'lapsed' && view.series.kind === 'expense',
  );
  const total = running.reduce(
    (sum, view) => sum + (basis === 'household' ? view.series.monthlyAmount : view.yourMonthly),
    0,
  );

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-muted-foreground text-sm">{t('summary.about')}</p>
        <p className="font-heading text-2xl font-semibold tabular-nums">
          <MoneyFlow minor={total} currency={currency} />
          <span className="text-muted-foreground font-sans text-base font-normal">
            {t('summary.perMonth')}
          </span>
        </p>
        <p className="text-muted-foreground text-xs">
          {t('summary.payments', { count: running.length })}
        </p>
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
