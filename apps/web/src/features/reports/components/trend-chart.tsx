import type { Currency, ReportMonth } from '@splinance/shared';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Rectangle,
  type RectangleProps,
  XAxis,
  YAxis,
} from 'recharts';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { formatMonth } from '@/features/transactions/dates';
import { formatMoney, toMajor } from '@/features/transactions/money';
import { compactNumber, shortMonth } from '../format';

export type ReportView = 'household' | 'mine';

const config = {
  // App tokens, so the legend outside the chart can use the same colors.
  spent: { label: 'Spent', color: 'var(--muted-foreground)' },
  income: { label: 'Income', color: 'var(--positive)' },
} satisfies ChartConfig;

/**
 * Spent and income per month, side by side. The selected month is solid, the others
 * faded (all solid without one); clicking a month selects it. The visible chart is decorative for screen readers:
 * a table below it holds the same numbers.
 */
export function TrendChart({
  months,
  currency,
  view,
  selected,
  onSelect,
}: {
  months: ReportMonth[];
  currency: Currency;
  view: ReportView;
  /** Solid; the others faded. None: all solid (a year). */
  selected?: string | undefined;
  onSelect: (month: string) => void;
}) {
  const data = months.map((m) => ({
    month: m.month,
    label: shortMonth(m.month),
    spent: view === 'mine' ? m.yourExpenses : m.expenses,
    income: view === 'mine' ? m.yourIncome : m.income,
  }));
  const money = (minor: number) => formatMoney(minor, currency);
  const select = (entry: { payload?: unknown }) => {
    const month = (entry.payload as { month?: string } | undefined)?.month;
    if (month) onSelect(month);
  };

  // An empty range would get Recharts' default 0-4 axis.
  if (data.every((d) => d.spent === 0 && d.income === 0)) {
    return (
      <p className="text-muted-foreground py-10 text-center">No transactions in these months.</p>
    );
  }

  return (
    <>
      <div className="text-muted-foreground mb-2 flex gap-4 text-xs" aria-hidden>
        {(['spent', 'income'] as const).map((key) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: config[key].color }} />
            {config[key].label}
          </span>
        ))}
      </div>
      <ChartContainer config={config} className="aspect-auto h-56 w-full" aria-hidden>
        <BarChart data={data} barGap={2} margin={{ left: 0, right: 0, top: 4 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={(value: number) => compactNumber(toMajor(value, currency))}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const month = (payload[0]?.payload as { month?: string } | undefined)?.month;
                  return month ? formatMonth(month) : '';
                }}
                valueFormatter={money}
              />
            }
          />
          {(['spent', 'income'] as const).map((key) => (
            <Bar
              key={key}
              dataKey={key}
              fill={`var(--color-${key})`}
              radius={[4, 4, 0, 0]}
              maxBarSize={18}
              className="cursor-pointer"
              onClick={select}
              shape={(props: RectangleProps & { payload?: { month?: string } }) => (
                <Rectangle
                  {...props}
                  fillOpacity={!selected || props.payload?.month === selected ? 1 : 0.45}
                />
              )}
            />
          ))}
        </BarChart>
      </ChartContainer>
      {/* The wrapper hides it: a caption renders outside the table's box, so sr-only on the
          table itself would leave the caption on screen. */}
      <div className="sr-only">
        <table>
          <caption>Spent and income per month</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Spent</th>
              <th scope="col">Income</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month}>
                <th scope="row">{formatMonth(d.month)}</th>
                <td>{money(d.spent)}</td>
                <td>{money(d.income)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
