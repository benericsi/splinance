import { addMonths, monthSchema } from '@splinance/shared';
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
import { type ReportView, TrendChart } from '@/features/reports/components/trend-chart';
import { formatMonthRange } from '@/features/reports/format';
import { reportQueries } from '@/features/reports/queries';
import { REPORT_WINDOW_MONTHS, reportWindow } from '@/features/reports/window';
import { currentMonth, formatMonth } from '@/features/transactions/dates';

/**
 * `to`: the trend's last month (default now); `month`: the month the categories show
 * (default `to`); `view`: the whole household's spending or the viewer's share.
 */
const searchSchema = z.object({
  to: monthSchema.optional().catch(undefined),
  month: monthSchema.optional().catch(undefined),
  view: z.enum(['household', 'mine']).optional().catch(undefined),
});

export const Route = createFileRoute('/_authenticated/h/$householdId/reports')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => {
    const { from, to } = reportWindow(search, currentMonth());
    return { from, to };
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

function ReportsPage() {
  const { householdId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const now = currentMonth();
  const { from, to, month } = reportWindow(search, now);
  const view: ReportView = search.view ?? 'household';
  const { data: household } = useSuspenseQuery(householdQueries.detail(householdId));
  const { data: categories } = useSuspenseQuery(categoryQueries.list(householdId));
  const { data: report } = useSuspenseQuery(reportQueries.range(householdId, from, to));

  const select = (next: string) => {
    void navigate({ search: (prev) => ({ ...prev, to, month: next }), resetScroll: false });
  };
  const stepLink = (
    label: string,
    Icon: typeof ChevronLeft,
    target: { to: string; month: string } | undefined,
  ) =>
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

  const earlier = addMonths(to, -REPORT_WINDOW_MONTHS);
  const sixLater = addMonths(to, REPORT_WINDOW_MONTHS);
  // Never past the current month.
  const later = sixLater > now ? now : sixLater;

  return (
    <RevealPage>
      <PageTitle title={`Reports · ${household.name}`} />
      <PageHeader
        title="Reports"
        actions={
          <SegmentedControl
            label="Whose spending"
            className="w-52"
            value={view}
            onChange={(next) => {
              void navigate({ search: (prev) => ({ ...prev, view: next }), resetScroll: false });
            }}
            options={VIEW_OPTIONS}
          />
        }
      />
      <div className="space-y-6">
        <Reveal index={0}>
          <Card>
            <CardHeader>
              <CardTitle>{formatMonthRange(from, to)}</CardTitle>
              <CardAction className="flex items-center">
                {stepLink('Earlier months', ChevronLeft, { to: earlier, month: earlier })}
                {stepLink(
                  'Later months',
                  ChevronRight,
                  to < now ? { to: later, month: later } : undefined,
                )}
              </CardAction>
            </CardHeader>
            <CardContent>
              <TrendChart
                months={report.months}
                currency={report.currency}
                view={view}
                selected={month}
                onSelect={select}
              />
            </CardContent>
          </Card>
        </Reveal>
        <Reveal index={1}>
          <Card>
            <CardHeader>
              <CardTitle>By category · {formatMonth(month)}</CardTitle>
              <CardAction className="flex items-center">
                {stepLink('Previous month', ChevronLeft, {
                  to: month <= from ? addMonths(month, -1) : to,
                  month: addMonths(month, -1),
                })}
                {stepLink(
                  'Next month',
                  ChevronRight,
                  month < now
                    ? { to: month >= to ? addMonths(month, 1) : to, month: addMonths(month, 1) }
                    : undefined,
                )}
              </CardAction>
            </CardHeader>
            <CardContent>
              <CategoryBreakdown
                // A new month is a new list: its bars grow from the start.
                key={month}
                rows={report.categories.filter((row) => row.month === month)}
                categories={categories}
                currency={report.currency}
                view={view}
                monthLabel={formatMonth(month)}
              />
            </CardContent>
          </Card>
        </Reveal>
      </div>
    </RevealPage>
  );
}

/** The trend card (legend, bars) and the category card (rows with bars). */
function ReportsSkeleton() {
  return (
    <PageSkeleton>
      <PageHeader title="Reports" actions={<Skeleton className="h-9 w-52 rounded-lg" />} />
      <div className="space-y-6">
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
