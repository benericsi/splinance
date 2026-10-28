import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { Logo } from '@/components/logo';
import { PageTitle } from '@/components/page-title';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useStartDemo } from '../hooks';

const REPO = 'https://github.com/benericsi/splinance';

const STATS = [
  { value: '12 months', label: "of a couple's shared and private spending" },
  { value: '2 banks', label: 'Revolut and K&H exports, imported like you would' },
  { value: '1 click', label: 'no sign-up, nothing to install' },
];

const STACK = [
  'React 19',
  'TypeScript',
  'TanStack Router and Query',
  'Express 5',
  'PostgreSQL 18',
  'Drizzle',
  'Zod',
  'Vitest and Playwright',
  'Python and Polars',
  'Airflow',
  'dbt',
  'Terraform on AWS',
];

const LINKS = [
  { href: `${REPO}/blob/main/docs/architecture.md`, label: 'Architecture and the hard parts' },
  { href: REPO, label: 'Source code on GitHub' },
  { href: `${REPO}/blob/main/docs/data-track.md`, label: 'The data pipeline' },
];

/**
 * The demo site's home page: what Splinance is, a tour on the brand's blue tile, and
 * "Try the demo", which seeds a household and signs the visitor in.
 */
export function DemoLanding() {
  const start = useStartDemo();
  const navigate = useNavigate();

  const tryDemo = () => {
    start.mutate(undefined, {
      onSuccess: ({ householdId }) => {
        void navigate({ to: '/h/$householdId', params: { householdId } });
      },
    });
  };

  return (
    <>
      <PageTitle title="Try the demo" />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 md:px-8">
        <Logo />
        <ThemeToggle />
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pb-16 md:px-8">
        <section className="mx-auto max-w-2xl pt-8 text-center md:pt-14">
          <h1 className="font-heading text-4xl font-extrabold tracking-tight text-balance md:text-6xl">
            Shared expenses, sorted.
          </h1>
          <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-base text-balance md:text-lg">
            Track what a household spends, split it fairly and always know who owes whom. Click
            through a year of a couple's money.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <Button size="lg" onClick={tryDemo} disabled={start.isPending}>
              {start.isPending ? 'Setting up your household…' : 'Try the demo'}
              {!start.isPending && <ArrowRight aria-hidden />}
            </Button>
            <p className="text-muted-foreground text-sm">
              No sign-up. Everything is deleted after 7 days.
            </p>
          </div>
        </section>

        <AppPreview />

        <section aria-label="What is in the demo" className="mt-16 md:mt-20">
          <dl className="grid gap-6 text-center sm:grid-cols-3">
            {STATS.map(({ value, label }) => (
              <div key={value}>
                <dt className="font-heading text-3xl font-extrabold tracking-tight">{value}</dt>
                <dd className="text-muted-foreground mt-1 text-sm">{label}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-16 grid gap-8 border-t pt-10 md:mt-20 md:grid-cols-2">
          <div>
            <h2 className="font-heading text-2xl font-bold tracking-tight">How it's built</h2>
            <p className="text-muted-foreground mt-2">
              A solo full-stack project: a typed API with real authorization and SQL transactions, a
              React app, end-to-end tests against production builds, and a data pipeline that reads
              this demo.
            </p>
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Technologies">
              {STACK.map((name) => (
                <li
                  key={name}
                  className="text-muted-foreground rounded-full border px-3 py-1 text-xs"
                >
                  {name}
                </li>
              ))}
            </ul>
          </div>
          <ul className="flex flex-col justify-center gap-1 md:items-start">
            {LINKS.map(({ href, label }) => (
              <li key={href}>
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-link inline-flex items-center gap-1 py-1 font-medium underline-offset-4 hover:underline"
                >
                  {label}
                  <ArrowUpRight className="size-4" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-muted-foreground mt-12 text-center text-xs text-balance">
          John and Jane Doe are made up. Please don't type in anything personal: demo data feeds the
          data pipeline until it is deleted.
        </p>
      </main>
    </>
  );
}

/**
 * The desktop app on the brand's blue tile with the phone overlapping its corner. Drawn
 * shapes for now; the recorded tour and screenshots replace them (A1f).
 */
function AppPreview() {
  return (
    <section aria-hidden className="relative mt-12 pb-8 md:mt-16">
      <div className="bg-brand-blue rounded-3xl p-4 pr-20 sm:p-8 sm:pr-36 md:p-12 md:pr-48">
        <Window className="aspect-video" />
      </div>
      <Phone className="absolute right-4 bottom-0 w-20 sm:right-8 sm:w-28 md:right-12 md:w-36" />
    </section>
  );
}

function Window({ className }: { className?: string }) {
  return (
    <div className={cn('bg-background flex flex-col overflow-hidden rounded-xl', className)}>
      <div className="flex h-6 shrink-0 items-center gap-1.5 border-b px-3">
        <span className="bg-muted size-2 rounded-full" />
        <span className="bg-muted size-2 rounded-full" />
        <span className="bg-muted size-2 rounded-full" />
      </div>
      <div className="flex flex-1">
        <div className="bg-muted/50 hidden w-1/5 flex-col gap-2 border-r p-3 sm:flex">
          <span className="bg-muted h-2 w-3/4 rounded" />
          <span className="bg-muted h-2 w-1/2 rounded" />
          <span className="bg-muted h-2 w-2/3 rounded" />
        </div>
        <div className="flex flex-1 flex-col gap-3 p-3 sm:p-6">
          <span className="bg-muted h-3 w-1/3 rounded" />
          <span className="bg-brand-green h-6 w-1/4 rounded sm:h-8" />
          <div className="mt-auto flex h-1/3 items-end gap-2">
            {[55, 80, 40, 70, 95, 60].map((height) => (
              <span
                key={height}
                className="bg-muted flex-1 rounded-t"
                style={{ height: `${String(height)}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Phone({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'border-foreground bg-background flex aspect-[9/19] flex-col gap-2 rounded-[1.25rem] border-4 p-2 sm:rounded-[1.75rem] sm:p-3',
        className,
      )}
    >
      <span className="bg-muted h-2 w-2/3 rounded" />
      <span className="bg-brand-green h-4 w-1/2 rounded" />
      <span className="bg-muted h-2 w-full rounded" />
      <span className="bg-muted h-2 w-5/6 rounded" />
      <span className="bg-muted h-2 w-full rounded" />
      <span className="bg-muted mt-auto h-3 w-full rounded" />
    </div>
  );
}
