import {
  type Category,
  CURRENCIES,
  type Currency,
  type RecurringSeries,
  type StatementRow,
  type TransactionVisibility,
} from '@splinance/shared';
import { ChevronDown, Lock, Repeat, Tags, Users, WandSparkles } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Collapse } from '@/components/collapse';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { CategoryPicker } from '@/features/categories/components/category-picker';
import { formatShortDate as shortDate } from '@/features/transactions/dates';
import { formatMoney, MONEY_LOCALE } from '@/features/transactions/money';
import { cn } from '@/lib/utils';
import { type ReviewGroup, type ReviewReason, type ReviewRow, reasonText } from '../review';

/** Signed, in the row's own currency (which may be one the app does not support yet). */
function rowAmount(row: StatementRow): string {
  const signed = row.kind === 'income' ? row.amount : -row.amount;
  if ((CURRENCIES as readonly string[]).includes(row.currency)) {
    return formatMoney(signed, row.currency as Currency, { signed: true });
  }
  return new Intl.NumberFormat(MONEY_LOCALE, {
    style: 'currency',
    currency: row.currency,
    signDisplay: 'exceptZero',
  }).format(signed / 100);
}

/** Which line of the folded summary a left-out row counts for. */
function leftOutKind(reason: ReviewReason | undefined): 'imported' | 'pending' | 'currency' {
  if (reason?.code === 'imported') return 'imported';
  if (reason?.code === 'pending') return 'pending';
  return 'currency';
}

interface ListProps {
  rows: ReviewRow[];
  categories: Category[];
  /** The recurring payment a picked row will count for, if any. */
  seriesOf: (review: ReviewRow) => RecurringSeries | undefined;
  onChange: (key: string, patch: Partial<ReviewRow>) => void;
  onBulk: (
    patch: Partial<Pick<ReviewRow, 'categoryId' | 'visibility'>>,
    onlyKind?: Category['kind'],
  ) => void;
}

/**
 * The review screen, grouped by what needs a decision: "Needs a look" (not picked, each
 * row says why), "Ready to import" (picked, with bulk actions) and what cannot be imported,
 * folded away.
 */
export function ReviewList({ rows, categories, seriesOf, onChange, onBulk }: ListProps) {
  const { t } = useTranslation('imports');
  const inGroup = (group: ReviewGroup) => rows.filter((review) => review.group === group);
  const needsLook = inGroup('needs-look');
  const ready = inGroup('ready');
  const leftOut = inGroup('left-out');

  return (
    <div className="space-y-6">
      {needsLook.length > 0 && (
        <Section title={t('review.needsLook')} count={needsLook.length}>
          <Rows rows={needsLook} categories={categories} seriesOf={seriesOf} onChange={onChange} />
        </Section>
      )}
      {ready.length > 0 && (
        <Section
          title={t('review.ready')}
          count={ready.length}
          actions={<BulkActions categories={categories} onBulk={onBulk} />}
        >
          <Rows rows={ready} categories={categories} seriesOf={seriesOf} onChange={onChange} />
        </Section>
      )}
      {leftOut.length > 0 && <LeftOut rows={leftOut} />}
    </div>
  );
}

function Section({
  title,
  count,
  actions,
  children,
}: {
  title: string;
  count: number;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="rounded-xl border px-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2 py-2">
        <h2 className="font-heading font-semibold">
          {title} <span className="text-muted-foreground font-normal tabular-nums">{count}</span>
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Rows({
  rows,
  categories,
  seriesOf,
  onChange,
}: {
  rows: ReviewRow[];
  categories: Category[];
  seriesOf: ListProps['seriesOf'];
  onChange: ListProps['onChange'];
}) {
  return (
    <ul>
      {rows.map((review) => (
        <ReviewItem
          key={review.key}
          review={review}
          categories={categories}
          series={review.included ? seriesOf(review) : undefined}
          onChange={onChange}
        />
      ))}
    </ul>
  );
}

function ReviewItem({
  review,
  categories,
  series,
  onChange,
}: {
  review: ReviewRow;
  categories: Category[];
  series: RecurringSeries | undefined;
  onChange: ListProps['onChange'];
}) {
  const { t } = useTranslation(['imports', 'transactions']);
  const { row } = review;
  const income = row.kind === 'income';
  const options = categories.filter((c) => c.kind === row.kind && c.archivedAt === null);

  return (
    // Wraps on narrow screens: the controls move under the description, like a card.
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t py-2.5">
      <input
        type="checkbox"
        checked={review.included}
        aria-label={t('review.importRow', { description: row.description })}
        onChange={(event) => {
          onChange(review.key, { included: event.target.checked });
        }}
        className="accent-primary size-4 shrink-0"
      />
      <span className="text-muted-foreground w-14 shrink-0 text-sm whitespace-nowrap tabular-nums">
        {shortDate(row.occurredOn)}
      </span>
      <div className="min-w-0 flex-1 basis-48">
        {review.included ? (
          <Input
            aria-label={t('review.descriptionOf', { description: row.description })}
            value={review.description}
            maxLength={120}
            onChange={(event) => {
              onChange(review.key, { description: event.target.value });
            }}
            className="h-8"
          />
        ) : (
          <p className="text-muted-foreground truncate">{review.description}</p>
        )}
        {review.reason && (
          <p className="text-muted-foreground mt-0.5 text-xs">{reasonText(review.reason)}</p>
        )}
        {review.included && review.rule && review.rule.categoryId === review.categoryId && (
          <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
            <WandSparkles className="size-3" aria-hidden />
            {t('review.byRule', { pattern: review.rule.pattern })}
          </p>
        )}
        {series && (
          <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
            <Repeat className="size-3" aria-hidden />
            {t('review.recurring', { name: series.name })}
          </p>
        )}
      </div>
      {review.included && (
        <>
          <div className="w-40 shrink-0">
            <CategoryPicker
              id={`category-${review.key}`}
              label={t('review.categoryOf', { description: row.description })}
              compact
              categories={options}
              value={review.categoryId}
              onChange={(categoryId) => {
                onChange(review.key, { categoryId });
              }}
            />
          </div>
          <SegmentedControl<TransactionVisibility>
            label={t('review.whoFor', { description: row.description })}
            className="w-36 shrink-0"
            value={review.visibility}
            onChange={(visibility) => {
              onChange(review.key, { visibility });
            }}
            options={[
              { value: 'shared', label: t('transactions:dialog.shared') },
              { value: 'private', label: t('transactions:dialog.justMe') },
            ]}
          />
        </>
      )}
      <span
        data-amount=""
        className={cn(
          'ml-auto w-28 shrink-0 text-right font-medium tabular-nums',
          income && 'text-positive',
          !review.included && 'text-muted-foreground',
        )}
      >
        {rowAmount(row)}
      </span>
    </li>
  );
}

function BulkActions({
  categories,
  onBulk,
}: {
  categories: Category[];
  onBulk: ListProps['onBulk'];
}) {
  const { t } = useTranslation(['imports', 'transactions']);
  const active = categories.filter((category) => category.archivedAt === null);
  const byKind = (kind: Category['kind']) => active.filter((category) => category.kind === kind);

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          onBulk({ visibility: 'shared' });
        }}
      >
        <Users aria-hidden />
        {t('review.markShared')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          onBulk({ visibility: 'private' });
        }}
      >
        <Lock aria-hidden />
        {t('transactions:dialog.justMe')}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
          <Tags aria-hidden />
          {t('review.setCategory')}
          <ChevronDown aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-80 min-w-52 overflow-y-auto">
          {(['expense', 'income'] as const).map((kind, index) => (
            <DropdownMenuGroup key={kind}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel>
                {kind === 'expense' ? t('review.forExpenses') : t('review.forIncome')}
              </DropdownMenuLabel>
              {byKind(kind).map((category) => (
                <DropdownMenuItem
                  key={category.id}
                  onClick={() => {
                    onBulk({ categoryId: category.id }, kind);
                  }}
                >
                  {category.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Rows that cannot be imported, summed up in one line that opens the list. */
function LeftOut({ rows }: { rows: ReviewRow[] }) {
  const { t } = useTranslation('imports');
  const [open, setOpen] = useState(false);
  const counts = new Map<ReturnType<typeof leftOutKind>, number>();
  for (const review of rows) {
    const kind = leftOutKind(review.reason);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const summary = [...counts.entries()]
    .map(([kind, count]) => t(`leftOut.${kind}`, { count }))
    .join(', ');

  return (
    <section aria-label={t('leftOut.label')}>
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
        className="text-muted-foreground -ml-2"
      >
        <ChevronDown aria-hidden className={cn('transition-transform', !open && '-rotate-90')} />
        {t('leftOut.summary', { summary })}
      </Button>
      <Collapse open={open}>
        <ul className="mt-2 rounded-xl border px-4 py-1">
          {rows.map((review) => (
            <li
              key={review.key}
              className="text-muted-foreground flex items-center gap-3 border-t py-2 text-sm first:border-t-0"
            >
              <span className="w-14 shrink-0 whitespace-nowrap tabular-nums">
                {shortDate(review.row.occurredOn)}
              </span>
              <span className="min-w-0 flex-1 truncate">{review.description}</span>
              <span className="hidden sm:inline">{review.reason && reasonText(review.reason)}</span>
              <span data-amount="" className="w-28 shrink-0 text-right tabular-nums">
                {rowAmount(review.row)}
              </span>
            </li>
          ))}
        </ul>
      </Collapse>
    </section>
  );
}
