import { GradientAvatar } from '@outpacelabs/avatars';
import type { ReactNode } from 'react';
import { Logo } from '@/components/logo';

// Deep blue to teal: calm, "money" colors. Fixed seed so the panel never changes.
const PANEL_COLORS = ['#1e1b4b', '#3730a3', '#4f46e5', '#0e7490', '#2dd4bf', '#c7d2fe'];

interface AuthLayoutProps {
  title: string;
  description: string;
  /** Top-right link, e.g. "No account yet? Create one". */
  aside: ReactNode;
  children: ReactNode;
}

/** Split auth screen: generative gradient panel on the left (lg+), form on the right. */
export function AuthLayout({ title, description, aside, children }: AuthLayoutProps) {
  return (
    <div className="bg-muted/40 grid min-h-svh gap-3 p-3 lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden rounded-2xl lg:block" aria-hidden>
        {/* Oversized so the blur fades outside the visible area, not at the edges. */}
        <GradientAvatar
          seed="splinance"
          size={720}
          radius={0}
          colors={PANEL_COLORS}
          className="absolute -inset-[10%]"
          style={{ width: '120%', height: '120%' }}
        />
        <div className="relative flex h-full flex-col justify-between p-10 text-white">
          <Logo className="text-white" />
          <div className="max-w-md space-y-3">
            <p className="text-white/80">Shared expenses, sorted</p>
            <p className="font-heading text-3xl leading-tight font-semibold text-balance">
              Track what you spend together and always know who owes whom.
            </p>
          </div>
        </div>
      </aside>

      <main className="bg-background flex flex-col rounded-2xl px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between gap-4">
          <Logo className="lg:invisible" />
          <p className="text-muted-foreground text-sm">{aside}</p>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <div className="mb-8 space-y-2">
            <h1 className="font-heading text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="text-muted-foreground">{description}</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
