import {
  type Category,
  CURRENCIES,
  type Currency,
  type StatementRow,
  type TransactionVisibility,
} from '@splinance/shared';
import { ChevronDown, Lock, Tags, Users } from 'lucide-react';
import { useState } from 'react';
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
import { fromIsoDate } from '@/features/transactions/dates';
import { formatMoney, MONEY_LOCALE } from '@/features/transactions/money';
import { cn } from '@/lib/utils';
import type { ReviewGroup, ReviewRow } from '../review';

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

/** "already imported", "not booked yet", "in another currency" for the folded summary. */
function leftOutLabel(reason: string | undefined): string {
  if (reason?.startsWith('Already')) return 'already imported';
  if (reason?.startsWith('Not booked')) return 'not booked yet';
  return 'in another currency';
}

const shortDate = (value: string) =>
  fromIsoDate(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

interface ListProps {
  rows: ReviewRow[];
  categories: Category[];
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
export function ReviewList({ rows, categories, onChange, onBulk }: ListProps) {
  const inGroup = (group: ReviewGroup) => rows.filter((review) => review.group === group);
  const needsLook = inGroup('needs-look');
  const ready = inGroup('ready');
  const leftOut = inGroup('left-out');

  return (
    <div className="space-y-6">
      {needsLook.length > 0 && (
        <Section title="Needs a look" count={needsLook.length}>
          <Rows rows={needsLook} categories={categories} onChange={onChange} />
        </Section>
      )}
      {ready.length > 0 && (
        <Section
          title="Ready to import"
          count={ready.length}
          actions={<BulkActions categories={categories} onBulk={onBulk} />}
        >
          <Rows rows={ready} categories={categories} onChange={onChange} />
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
  onChange,
}: {
  rows: ReviewRow[];
  categories: Category[];
  onChange: ListProps['onChange'];
}) {
  return (
    <ul>
      {rows.map((review) => (
        <ReviewItem key={review.key} review={review} categories={categories} onChange={onChange} />
      ))}
    </ul>
  );
}

function ReviewItem({
  review,
  categories,
  onChange,
}: {
  review: ReviewRow;
  categories: Category[];
  onChange: ListProps['onChange'];
}) {
  const { row } = review;
  const income = row.kind === 'income';
  const options = categories.filter((c) => c.kind === row.kind && c.archivedAt === null);

  return (
    // Wraps on narrow screens: the controls move under the description, like a card.
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t py-2.5">
      <input
        type="checkbox"
        checked={review.included}
        aria-label={`Import ${row.description}`}
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
            aria-label={`Description of ${row.description}`}
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
        {review.reason && <p className="text-muted-foreground mt-0.5 text-xs">{review.reason}</p>}
      </div>
      {review.included && (
        <>
          <div className="w-40 shrink-0">
            <CategoryPicker
              id={`category-${review.key}`}
              label={`Category of ${row.description}`}
              compact
              categories={options}
              value={review.categoryId}
              onChange={(categoryId) => {
                onChange(review.key, { categoryId });
              }}
            />
          </div>
          <SegmentedControl<TransactionVisibility>
            label={`Who ${row.description} is for`}
            className="w-36 shrink-0"
            value={review.visibility}
            onChange={(visibility) => {
              onChange(review.key, { visibility });
            }}
            options={[
              { value: 'shared', label: 'Shared' },
              { value: 'private', label: 'Just me' },
            ]}
          />
        </>
      )}
      <span
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
        Mark picked shared
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          onBulk({ visibility: 'private' });
        }}
      >
        <Lock aria-hidden />
        Just me
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
          <Tags aria-hidden />
          Set category
          <ChevronDown aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-80 min-w-52 overflow-y-auto">
          {(['expense', 'income'] as const).map((kind, index) => (
            <DropdownMenuGroup key={kind}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel>
                {kind === 'expense' ? 'For picked expenses' : 'For picked income'}
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
  const [open, setOpen] = useState(false);
  const counts = new Map<string, number>();
  for (const review of rows) {
    const label = leftOutLabel(review.reason);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const summary = [...counts.entries()]
    .map(([label, count]) => `${String(count)} ${label}`)
    .join(', ');

  return (
    <section aria-label="Left out">
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
        Left out: {summary}
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
              <span className="hidden sm:inline">{review.reason}</span>
              <span className="w-28 shrink-0 text-right tabular-nums">{rowAmount(review.row)}</span>
            </li>
          ))}
        </ul>
      </Collapse>
    </section>
  );
}
