import type { ReactNode } from 'react';
import { PosterWall } from '@/components/brand/poster-wall';
import { Logo } from '@/components/logo';

interface AuthLayoutProps {
  title: string;
  description: string;
  /** Top-right link, e.g. "No account yet? Create one". */
  aside: ReactNode;
  children: ReactNode;
}

/** Split auth screen: poster wall on the left (lg+), form on the right. */
export function AuthLayout({ title, description, aside, children }: AuthLayoutProps) {
  return (
    <div className="bg-muted/40 grid min-h-svh gap-3 p-3 lg:grid-cols-2">
      <aside className="bg-background hidden flex-col justify-between gap-8 rounded-2xl p-8 lg:flex">
        <Logo className="self-start" />
        <PosterWall className="flex-1" />
        <div className="space-y-3">
          <p className="font-heading text-4xl leading-[1.05] font-extrabold tracking-tight text-balance">
            Shared expenses, sorted.
          </p>
          <p className="text-muted-foreground max-w-md text-base">
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
