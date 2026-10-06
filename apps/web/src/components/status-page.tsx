import type { ReactNode } from 'react';
import { Logo } from '@/components/logo';
import { PageTitle } from '@/components/page-title';

interface StatusPageProps {
  /** Large, muted code above the title, e.g. "404". */
  code?: string;
  title: string;
  description: string;
  actions: ReactNode;
  children?: ReactNode;
  /** Own page with logo (root level); otherwise rendered inside the current layout. */
  fullPage?: boolean;
}

/** Not found / error message, either as its own page or inside the current layout. */
export function StatusPage({
  code,
  title,
  description,
  actions,
  children,
  fullPage = false,
}: StatusPageProps) {
  const content = (
    <>
      <PageTitle title={title} />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center py-16 text-center">
        {code && (
          <p className="text-muted-foreground/60 font-heading text-6xl font-semibold tracking-tight">
            {code}
          </p>
        )}
        <h1 className="font-heading mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-2">{description}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">{actions}</div>
        {children}
      </div>
    </>
  );

  if (!fullPage) return content;
  return (
    <div className="flex min-h-svh flex-col px-6 py-6">
      <Logo />
      <main className="flex flex-1 flex-col">{content}</main>
    </div>
  );
}
