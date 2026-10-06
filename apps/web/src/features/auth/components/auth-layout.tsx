import type { ReactNode } from 'react';
import { Pattern } from '@/components/brand/pattern';
import { Logo } from '@/components/logo';

// Fixed seeds: the poster wall looks the same on every visit.
const POSTER_SEEDS = ['porto', 'kyoto', 'nyc', 'rome', 'miami', 'berlin'];

interface AuthLayoutProps {
  title: string;
  description: string;
  /** Top-right link, e.g. "No account yet? Create one". */
  aside: ReactNode;
  children: ReactNode;
}

/** Split auth screen: brand poster wall on the left (lg+), form on the right. */
export function AuthLayout({ title, description, aside, children }: AuthLayoutProps) {
  return (
    <div className="bg-muted/40 grid min-h-svh gap-3 p-3 lg:grid-cols-2">
      <aside className="bg-brand-blue hidden flex-col gap-8 rounded-2xl p-10 lg:flex">
        {/* Pink on blue is 5:1, cream on blue 7.9:1: both readable. */}
        <Logo tile={false} className="text-brand-pink self-start" />
        <div className="grid flex-1 grid-cols-3 gap-3" aria-hidden>
          {POSTER_SEEDS.map((seed) => (
            <div key={seed} className="overflow-hidden rounded-xl">
              <Pattern seed={seed} decorative cell={36} />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <p className="font-heading text-brand-pink text-4xl leading-[1.05] font-extrabold tracking-tight text-balance">
            Shared expenses, sorted.
          </p>
          <p className="text-brand-cream max-w-md text-base">
            Track what you spend together and always know who owes whom.
          </p>
        </div>
      </aside>

      <main className="bg-background flex flex-col rounded-2xl px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between gap-4">
          <Logo className="lg:invisible" />
          <p className="text-muted-foreground text-sm">{aside}</p>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <div className="mb-8 space-y-2">
            <h1 className="font-heading text-3xl font-extrabold tracking-tight">{title}</h1>
            <p className="text-muted-foreground">{description}</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
