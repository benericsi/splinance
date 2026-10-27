import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Building blocks for the pages' loading states. Each mirrors the real component's box
 * (paddings, line heights), so nothing moves when the content replaces it.
 */

/** Stand-ins for the buttons next to a page's h1 (`size="lg"`). */
export function SkeletonActions({ widths }: { widths: string[] }) {
  return (
    <>
      {widths.map((width, index) => (
        <Skeleton key={index} className={cn('h-9 rounded-lg', width)} />
      ))}
    </>
  );
}

/** A line of text: a bar centered in the line box of the given height. */
export function SkeletonLine({
  className,
  line = 'h-5',
}: {
  className?: string;
  /** The line box of the text it stands for, e.g. `h-4` for text-xs. */
  line?: string;
}) {
  return (
    <div className={cn('flex items-center', line)}>
      <Skeleton className={cn('h-[60%] w-full', className)} />
    </div>
  );
}

/** The grey stat tiles above a list (month totals, budget totals). */
export function SkeletonStats({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="bg-muted/50 min-w-0 rounded-lg px-3 py-2.5">
          <SkeletonLine line="h-4" className="w-14" />
          <SkeletonLine line="h-5 sm:h-7" className="w-20" />
        </div>
      ))}
    </div>
  );
}

/** A row with a category tile, two lines of text and an amount. */
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 py-2.5', className)}>
      <Skeleton className="size-9 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <SkeletonLine className="w-2/5" />
        <SkeletonLine line="h-4" className="w-1/4" />
      </div>
      <SkeletonLine className="w-16" />
    </div>
  );
}

/** A card with a title and whatever stands for its content. */
export function SkeletonCard({
  title = 'w-32',
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <SkeletonLine line="h-5.5" className={title} />
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
