import type { ReactNode } from 'react';
import { BrandPanel } from '@/components/brand/brand-panel';
import { Logo } from '@/components/logo';
import { PageTitle } from '@/components/page-title';
import { UserMenu } from '@/features/auth/components/user-menu';
import { useAuth } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

interface OnboardingLayoutProps {
  step: number;
  steps: number;
  title: string;
  description: ReactNode;
  /** Usually a "Back" link; rendered under the step content. */
  footer?: ReactNode;
  children?: ReactNode;
}

/** Split screen like the auth pages, plus a step indicator and the account menu. */
export function OnboardingLayout({
  step,
  steps,
  title,
  description,
  footer,
  children,
}: OnboardingLayoutProps) {
  const { user } = useAuth();

  return (
    <div className="bg-muted/40 grid min-h-svh gap-3 p-3 lg:grid-cols-2">
      <PageTitle title={title} />
      <BrandPanel />

      <main className="bg-background flex flex-col rounded-2xl px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between gap-4">
          <Logo className="lg:invisible" />
          {user && <UserMenu user={user} />}
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <StepIndicator step={step} steps={steps} />
          <div className="mb-8 space-y-2">
            <h1 className="font-heading text-3xl font-extrabold tracking-tight">{title}</h1>
            <p className="text-muted-foreground">{description}</p>
          </div>
          {children}
          {footer && <div className="mt-6">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

function StepIndicator({ step, steps }: { step: number; steps: number }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <ol className="flex items-center gap-1.5" aria-hidden>
        {Array.from({ length: steps }, (_, index) => (
          <li
            key={index}
            className={cn(
              'h-1.5 rounded-full transition-all',
              index < step ? 'bg-foreground w-6' : 'bg-border w-1.5',
            )}
          />
        ))}
      </ol>
      <p className="text-muted-foreground text-sm">
        Step {step} of {steps}
      </p>
    </div>
  );
}
