import type { DismissedRecurring } from '@splinance/shared';
import { ChevronRight, Lock } from 'lucide-react';
import { useState } from 'react';
import { Collapse } from '@/components/collapse';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useRemoveSeries } from '../hooks';

/** Suggestions marked "Not recurring", folded away, each with "Show again". */
export function HiddenList({
  householdId,
  dismissed,
}: {
  householdId: string;
  dismissed: DismissedRecurring[];
}) {
  const [open, setOpen] = useState(false);
  const showAgain = useRemoveSeries();

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex items-center gap-1.5 rounded-md text-sm outline-none focus-visible:ring-[3px]"
      >
        <ChevronRight
          aria-hidden
          className={cn('size-4 transition-transform duration-150', open && 'rotate-90')}
        />
        Hidden ({dismissed.length})
      </button>
      <Collapse open={open}>
        <ul className="mt-2 divide-y rounded-xl border">
          {dismissed.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">{item.pattern}</span>
              {item.scope === 'private' && (
                <Lock className="text-muted-foreground size-3 shrink-0" aria-label="Only you" />
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={showAgain.isPending}
                aria-label={`Show ${item.pattern} again`}
                onClick={() => {
                  showAgain.mutate({ householdId, seriesId: item.id });
                }}
              >
                Show again
              </Button>
            </li>
          ))}
        </ul>
      </Collapse>
    </div>
  );
}
