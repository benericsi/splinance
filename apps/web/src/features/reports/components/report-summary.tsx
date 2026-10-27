import type { Category, Currency } from '@splinance/shared';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { CategoryTile } from '@/features/categories/components/category-tile';
import { MoneyFlow } from '@/features/transactions/components/money-flow';
import { formatMoney } from '@/features/transactions/money';
import { cn } from '@/lib/utils';
import { percentChange, type ReportSummary } from '../summary';
import type { ReportView } from './trend-chart';

/**
 * Four cards above the charts: spent, income, left over (each against the period before,
 * with a sparkline) and the top category. Up is good for income and left over, bad for
 * spending; the badge says so in its color and its arrow, the line under it in words.
 */
export function ReportSummaryCards({
  summary,
  categories,
  currency,
  view,
  periodLabel,
}: {
  summary: ReportSummary;
  categories: Category[];
  currency: Currency;
  view: ReportView;
  /** "October 2026", "2026 so far". */
  periodLabel: string;
}) {
  const { previous } = summary;
  const before = (minor: number | undefined) =>
    minor === undefined
      ? `Nothing ${summary.compareLabel.replace(/^vs /, 'in ')}`
      : `${summary.compareLabel}: ${formatMoney(minor, currency)}`;
  const top = summary.top;
  const topCategory = top?.categoryId ? categories.find((c) => c.id === top.categoryId) : undefined;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard
        label={view === 'mine' ? 'You spent' : 'Spent'}
        value={<MoneyFlow minor={summary.spent} currency={currency} />}
        badge={<ChangeBadge value={summary.spent} before={previous?.spent} upIsGood={false} />}
        detail={before(previous?.spent)}
        sparkline={
          <Sparkline
            values={summary.trend.spent}
            selected={summary.trend.selected}
            tone="neutral"
          />
        }
      />
      <KpiCard
        label={view === 'mine' ? 'Your income' : 'Income'}
        value={<MoneyFlow minor={summary.income} currency={currency} />}
        badge={<ChangeBadge value={summary.income} before={previous?.income} upIsGood />}
        detail={before(previous?.income)}
        sparkline={
          <Sparkline
            values={summary.trend.income}
            selected={summary.trend.selected}
            tone="positive"
          />
        }
      />
      <KpiCard
        label="Left over"
        value={
          <MoneyFlow
            minor={summary.left}
            currency={currency}
            className={summary.left < 0 ? 'text-negative' : undefined}
          />
        }
        badge={<ChangeBadge value={summary.left} before={previous?.left} upIsGood />}
        detail={
          summary.savedPercent === null
            ? 'No income'
            : summary.savedPercent < 0
              ? `${String(-summary.savedPercent)}% more than income`
              : `${String(summary.savedPercent)}% of income saved`
        }
        sparkline={
          <Sparkline
            values={summary.trend.left}
            selected={summary.trend.selected}
            tone={summary.left < 0 ? 'negative' : 'positive'}
          />
        }
      />
      <KpiCard
        label="Top category"
        value={
          top ? (
            <span className="flex min-w-0 items-center gap-2">
              <CategoryTile category={topCategory} size="sm" />
              <span className="truncate">
                {top.categoryId === null ? 'No category' : (topCategory?.name ?? 'Unknown')}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">None</span>
          )
        }
        // The share is in the line under it: a badge would squeeze the label on a phone.
        detail={
          top
            ? `${String(top.percent)}% · ${formatMoney(top.amount, currency)} in ${periodLabel}`
            : `No spending in ${periodLabel}`
        }
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  badge,
  detail,
  sparkline,
}: {
  label: string;
  value: ReactNode;
  badge?: ReactNode;
  detail: string;
  sparkline?: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className="bg-card ring-foreground/10 flex min-w-0 flex-col rounded-xl px-4 py-3.5 ring-1"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-muted-foreground truncate text-sm">{label}</h2>
        {badge}
      </div>
      <p className="font-heading mt-1.5 truncate text-lg font-semibold tabular-nums sm:text-xl">
        {value}
      </p>
      {/* Two lines at most: "vs Jan–Oct 2025: 954 480 Ft" does not fit a phone's card. */}
      <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">{detail}</p>
      <div className="mt-auto pt-2">{sparkline ?? <span className="block h-7" aria-hidden />}</div>
    </section>
  );
}

/** "↑ 12%" in green or red depending on whether up is good here; nothing to compare: none. */
function ChangeBadge({
  value,
  before,
  upIsGood,
}: {
  value: number;
  before: number | undefined;
  upIsGood: boolean;
}) {
  if (before === undefined) return null;
  const change = percentChange(value, before);
  if (change === null) return null;
  if (change === 0) {
    return (
      <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">± 0%</span>
    );
  }
  const up = change > 0;
  const good = up === upIsGood;
  const Arrow = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
        good ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative',
      )}
    >
      <Arrow className="size-3" aria-hidden />
      <span className="sr-only">{up ? 'up' : 'down'} </span>
      {Math.abs(change)}%
    </span>
  );
}

/**
 * A line through the months (decorative: the charts below hold the numbers), with a dot on
 * the month the card shows.
 */
function Sparkline({
  values,
  selected,
  tone,
}: {
  values: number[];
  selected: number;
  tone: 'neutral' | 'positive' | 'negative';
}) {
  const width = 120;
  const height = 28;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => ({
    x: values.length > 1 ? (index / (values.length - 1)) * width : width / 2,
    y: height - 3 - ((value - min) / span) * (height - 6),
  }));
  const dot = points[selected];
  // The line stretches with the card; the dot is HTML so it stays round.
  return (
    <div
      className={cn(
        'relative h-7',
        tone === 'neutral' && 'text-muted-foreground',
        tone === 'positive' && 'text-positive',
        tone === 'negative' && 'text-negative',
      )}
      aria-hidden
    >
      <svg
        viewBox={`0 0 ${String(width)} ${String(height)}`}
        preserveAspectRatio="none"
        className="block size-full overflow-visible"
      >
        <polyline
          points={points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {dot && (
        <span
          className="ring-card absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-2"
          style={{
            left: `${String((dot.x / width) * 100)}%`,
            top: `${String((dot.y / height) * 100)}%`,
          }}
        />
      )}
    </div>
  );
}
