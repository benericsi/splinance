import { addMonths, monthSchema, type ReportCategory } from '@splinance/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { z } from 'zod';
import { PageHeader } from '@/components/page-header';
import { PageTitle } from '@/components/page-title';
import { PageSkeleton, Reveal, RevealPage } from '@/components/reveal';
import { SegmentedControl } from '@/components/segmented-control';
import { SkeletonLine } from '@/components/skeletons';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { categoryQueries } from '@/features/categories/queries';
import { householdQueries } from '@/features/households/queries';
import { CategoryBreakdown } from '@/features/reports/components/category-breakdown';
import { ReportSummaryCards } from '@/features/reports/components/report-summary';
import { type ReportView, TrendChart } from '@/features/reports/components/trend-chart';
import { formatMonthRange } from '@/features/reports/format';
import { reportQueries } from '@/features/reports/queries';
import { summarize } from '@/features/reports/summary';
import { fetchRange, REPORT_WINDOW_MONTHS, reportRange } from '@/features/reports/window';
import { currentMonth, formatMonth } from '@/features/transactions/dates';

/**
 * `period`: six months (default) or a calendar year. Months: `to` is the trend's last month
 * (default now), `month` the one the categories show (default `to`). Year: `year` (default
 * the selected month's). `view`: the whole household's spending or the viewer's share.
 */
const searchSchema = z.object({
  period: z.enum(['month', 'year']).optional().catch(undefined),
  // A number: the router reads search values as JSON, so `year=2026` arrives as one.
  year: z.number().int().min(1970).max(9999).optional().catch(undefined),
  to: monthSchema.optional().catch(undefined),
  month: monthSchema.optional().catch(undefined),
  view: z.enum(['household', 'mine']).optional().catch(undefined),
});

export const Route = createFileRoute('/_authenticated/h/$householdId/reports')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => {
    return fetchRange(reportRange(toRangeSearch(search), currentMonth()));
  },
  loader: async ({ context: { queryClient }, params: { householdId }, deps: { from, to } }) => {
    await Promise.all([
      queryClient.query(reportQueries.range(householdId, from, to)),
      queryClient.query(categoryQueries.list(householdId)),
    ]);
  },
  component: ReportsPage,
  pendingComponent: ReportsSkeleton,
});

const VIEW_OPTIONS = [
  { value: 'household', label: 'Household' },
  { value: 'mine', label: 'Your share' },
] as const;

const PERIOD_OPTIONS = [
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
] as const;

type Search = z.infer<typeof searchSchema>;
type SearchPatch = Partial<Search>;

const toRangeSearch = ({ year, ...search }: Search) => ({
  ...search,
  year: year === undefined ? undefined : String(year),
});

/** A year's rows added up per category. */
function sumByCategory(rows: ReportCategory[]): Omit<ReportCategory, 'month'>[] {
  const totals = new Map<string | null, Omit<ReportCategory, 'month'>>();
  for (const { categoryId, expenses, yourExpenses } of rows) {
    const total = totals.get(categoryId) ?? { categoryId, expenses: 0, yourExpenses: 0 };
    total.expenses += expenses;
    total.yourExpenses += yourExpenses;
    totals.set(categoryId, total);
  }
  return [...totals.values()];
}

function ReportsPage() {
  const { householdId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const now = currentMonth();
  const range = reportRange(toRangeSearch(search), now);
  const view: ReportView = search.view ?? 'household';
  const { data: household } = useSuspenseQuery(householdQueries.detail(householdId));
  const { data: categories } = useSuspenseQuery(categoryQueries.list(householdId));
  const fetched = fetchRange(range);
  // Reaches one period further back for the cards' comparisons; the charts show `range`.
  const { data: report } = useSuspenseQuery(
    reportQueries.range(householdId, fetched.from, fetched.to),
  );
  const inRange = (month: string) => month >= range.from && month <= range.to;
  const summary = summarize(report, range, view, now);

  const go = (patch: SearchPatch) => {
    void navigate({ search: (prev) => ({ ...prev, ...patch }), resetScroll: false });
  };
  const stepLink = (label: string, Icon: typeof ChevronLeft, target: SearchPatch | undefined) =>
    target ? (
      <Link
        from={Route.fullPath}
        search={(prev) => ({ ...prev, ...target })}
        resetScroll={false}
        aria-label={label}
        className={buttonVariants({ variant: 'ghost', size: 'icon' })}
      >
        <Icon aria-hidden />
      </Link>
    ) : (
      <span className="size-8" aria-hidden />
    );

  // A month clicked in a year opens that month (with the six months up to it, at most now).
  const openMonth = (month: string) => {
    go({ period: undefined, year: undefined, to: month > now ? now : month, month });
  };

  let trendTitle: string;
  let trendSteps: [SearchPatch | undefined, SearchPatch | undefined];
  let breakdown: {
    title: string;
    label: string;
    key: string;
    rows: Omit<ReportCategory, 'month'>[];
    steps?: [SearchPatch | undefined, SearchPatch | undefined];
  };
  if (range.period === 'year') {
    const thisYear = now.slice(0, 4);
    trendTitle = range.year;
    trendSteps = [
      { year: Number(range.year) - 1 },
      range.year < thisYear ? { year: Number(range.year) + 1 } : undefined,
    ];
    breakdown = {
      title: `By category · ${range.year}${range.year === thisYear ? ' so far' : ''}`,
      label: range.year,
      key: range.year,
      rows: sumByCategory(report.categories.filter((row) => inRange(row.month))),
    };
  } else {
    const { from, to, month } = range;
    const earlier = addMonths(to, -REPORT_WINDOW_MONTHS);
    const sixLater = addMonths(to, REPORT_WINDOW_MONTHS);
    // Never past the current month.
    const later = sixLater > now ? now : sixLater;
    trendTitle = formatMonthRange(from, to);
    trendSteps = [
      { to: earlier, month: earlier },
      to < now ? { to: later, month: later } : undefined,
    ];
    breakdown = {
      title: `By category · ${formatMonth(month)}`,
      label: formatMonth(month),
      key: month,
      rows: report.categories.filter((row) => row.month === month),
      steps: [
        { to: month <= from ? addMonths(month, -1) : to, month: addMonths(month, -1) },
        month < now
          ? { to: month >= to ? addMonths(month, 1) : to, month: addMonths(month, 1) }
          : undefined,
      ],
    };
  }
  const isYear = range.period === 'year';

  return (
    <RevealPage>
      <PageTitle title={`Reports · ${household.name}`} />
      <PageHeader title="Reports" />
      <div className="space-y-6">
        {/* Side by side on a phone too: they share the width there. */}
        <Reveal index={0} className="flex gap-2">
          <SegmentedControl
            label="Whose spending"
            className="min-w-0 flex-[3] sm:w-52 sm:flex-none"
            value={view}
            onChange={(next) => {
              go({ view: next });
            }}
            options={VIEW_OPTIONS}
          />
          <SegmentedControl
            label="Period"
            className="min-w-0 flex-[2] sm:w-40 sm:flex-none"
            value={range.period}
            onChange={(next) => {
              if (next === 'year') {
                go({
                  period: 'year',
                  year: Number((range.period === 'month' ? range.month : now).slice(0, 4)),
                });
              } else {
                go({ period: undefined, year: undefined });
              }
            }}
            options={PERIOD_OPTIONS}
          />
        </Reveal>
        <Reveal index={1}>
          <ReportSummaryCards
            summary={summary}
            categories={categories}
            currency={report.currency}
            view={view}
            periodLabel={breakdown.label}
          />
        </Reveal>
        <Reveal index={2}>
          <Card>
            <CardHeader>
              <CardTitle>{trendTitle}</CardTitle>
              <CardAction className="flex items-center">
                {stepLink(isYear ? 'Previous year' : 'Earlier months', ChevronLeft, trendSteps[0])}
                {stepLink(isYear ? 'Next year' : 'Later months', ChevronRight, trendSteps[1])}
              </CardAction>
            </CardHeader>
            <CardContent>
              <TrendChart
                months={report.months.filter((m) => inRange(m.month))}
                currency={report.currency}
                view={view}
                selected={range.period === 'month' ? range.month : undefined}
                onSelect={
                  range.period === 'month'
                    ? (month) => {
                        go({ to: range.to, month });
                      }
                    : openMonth
                }
              />
            </CardContent>
          </Card>
        </Reveal>
        <Reveal index={3}>
          <Card>
            <CardHeader>
              <CardTitle>{breakdown.title}</CardTitle>
              {breakdown.steps && (
                <CardAction className="flex items-center">
                  {stepLink('Previous month', ChevronLeft, breakdown.steps[0])}
                  {stepLink('Next month', ChevronRight, breakdown.steps[1])}
                </CardAction>
              )}
            </CardHeader>
            <CardContent>
              <CategoryBreakdown
                // A new month or year is a new list: its bars grow from the start.
                key={breakdown.key}
                rows={breakdown.rows}
                categories={categories}
                currency={report.currency}
                view={view}
                periodLabel={breakdown.label}
              />
            </CardContent>
          </Card>
        </Reveal>
      </div>
    </RevealPage>
  );
}

/** The switches, the four cards, the trend card and the category card. */
function ReportsSkeleton() {
  return (
    <PageSkeleton>
      <PageHeader title="Reports" />
      <div className="space-y-6">
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-[3] rounded-lg sm:w-52 sm:flex-none" />
          <Skeleton className="h-9 flex-[2] rounded-lg sm:w-40 sm:flex-none" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="ring-foreground/10 rounded-xl px-4 py-3.5 ring-1">
              <SkeletonLine className="w-16" />
              <SkeletonLine line="mt-1.5 h-7" className="w-28" />
              <SkeletonLine line="mt-0.5 h-4" className="w-24" />
              <Skeleton className="mt-2 h-7" />
            </div>
          ))}
        </div>
        <Card>
          <CardHeader>
            <SkeletonLine line="h-5.5" className="w-36" />
          </CardHeader>
          <CardContent>
            <SkeletonLine line="h-4" className="mb-2 w-32" />
            <div className="flex h-56 items-end gap-[6%] px-12 pb-6">
              {[55, 70, 48, 80, 62, 75].map((height, index) => (
                <Skeleton
                  key={index}
                  className="flex-1 rounded-t-md rounded-b-none"
                  style={{ height: `${String(height)}%` }}
                />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <SkeletonLine line="h-5.5" className="w-52" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="size-6 shrink-0 rounded-md" />
                <SkeletonLine className="w-24" />
                <Skeleton className="h-2.5 flex-1 rounded-full" />
                <SkeletonLine className="w-24" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageSkeleton>
  );
}
