import { createLink, type LinkComponent } from '@tanstack/react-router';
import { ArrowUpRight } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { Reveal } from '@/components/reveal';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * A row of the overview's bento grid. A tile that renders nothing vanishes (its `Tile` slot
 * is empty, so hidden) and its neighbours stretch; a row with no tile left hides too.
 */
export function OverviewRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-4 lg:flex-nowrap [&:not(:has(>:not(:empty)))]:hidden">
      {children}
    </div>
  );
}

/**
 * From `lg` a tile grows by its weight from a basis of the gaps it spans, which is exactly
 * a column span of a four column grid when a row adds up to 4 (so rows line up), and a
 * proportional share when a neighbour is hidden. Below `lg` big tiles take the whole row and
 * small ones share the next.
 */
const WEIGHT = {
  1: 'min-w-0 flex-1 basis-0 lg:flex-[1_1_0%]',
  2: 'basis-full lg:flex-[2_2_1rem]',
  3: 'basis-full lg:flex-[3_3_2rem]',
  4: 'basis-full',
} as const;

/** A slot of an `OverviewRow`: its weight (columns out of 4) and its place in the entrance. */
export function Tile({
  weight,
  index,
  stretch = true,
  children,
}: {
  weight: keyof typeof WEIGHT;
  index: number;
  /** Off for a short tile next to a long one (members beside the settlements). */
  stretch?: boolean;
  children: ReactNode;
}) {
  return (
    <Reveal index={index} className={cn('flex *:flex-1', WEIGHT[weight], !stretch && 'self-start')}>
      {children}
    </Reveal>
  );
}

/**
 * A neutral tile: a region named by its small title, an optional round arrow link in the
 * corner, the content below.
 */
export function TileBox({
  title,
  action,
  className,
  children,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <Card role="region" aria-labelledby={headingId} className={cn('min-w-0', className)}>
      <CardHeader>
        <CardTitle id={headingId} className="text-muted-foreground text-sm font-normal">
          {title}
        </CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">{children}</CardContent>
    </Card>
  );
}

function ArrowChip({ className, ...props }: React.ComponentProps<'a'>) {
  return (
    <a
      {...props}
      className={cn(
        'bg-muted text-foreground hover:bg-accent focus-visible:ring-ring/50 -my-1 flex size-7 items-center justify-center rounded-full outline-none focus-visible:ring-[3px]',
        className,
      )}
    >
      <ArrowUpRight className="size-4" aria-hidden />
    </a>
  );
}

const ArrowLink = createLink(ArrowChip);

/** The round arrow in a tile's corner: a router link, named by `aria-label`. */
export const TileLink: LinkComponent<typeof ArrowChip> = (props) => <ArrowLink {...props} />;
