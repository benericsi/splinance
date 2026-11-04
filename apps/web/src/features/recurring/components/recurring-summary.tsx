import type { Currency } from '@splinance/shared';
import { useState } from 'react';
import { SegmentedControl } from '@/components/segmented-control';
import { MoneyFlow } from '@/features/transactions/components/money-flow';
import type { SeriesView } from '../view';

type Basis = 'household' | 'yours';

/**
 * What the recurring payments cost per month: all of them (shared ones in full, plus the
 * viewer's private ones) or the viewer's part. Payments gone quiet do not count.
 */
export function RecurringSummary({ views, currency }: { views: SeriesView[]; currency: Currency }) {
  const [basis, setBasis] = useState<Basis>('household');
  const running = views.filter((view) => view.timing !== 'lapsed');
  const total = running.reduce(
    (sum, view) => sum + (basis === 'household' ? view.series.monthlyAmount : view.yourMonthly),
    0,
  );

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-muted-foreground text-sm">About</p>
        <p className="font-heading text-2xl font-semibold tabular-nums">
          <MoneyFlow minor={total} currency={currency} />
          <span className="text-muted-foreground font-sans text-base font-normal"> a month</span>
        </p>
        <p className="text-muted-foreground text-xs">
          {running.length} {running.length === 1 ? 'payment' : 'payments'}
        </p>
      </div>
      <SegmentedControl<Basis>
        label="Count"
        value={basis}
        onChange={setBasis}
        options={[
          { value: 'household', label: 'Household' },
          { value: 'yours', label: 'Your share' },
        ]}
        className="w-auto sm:w-56"
      />
    </div>
  );
}
