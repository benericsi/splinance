import type { DismissedRecurring } from '@splinance/shared';
import { ChevronRight, Lock } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('recurring');
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
        {t('hidden.toggle', { count: dismissed.length })}
      </button>
      <Collapse open={open}>
        <ul className="mt-2 divide-y rounded-xl border">
          {dismissed.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">{item.pattern}</span>
              {item.scope === 'private' && (
                <Lock className="text-muted-foreground size-3 shrink-0" aria-label={t('onlyYou')} />
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={showAgain.isPending}
                aria-label={t('hidden.showAgainLabel', { pattern: item.pattern })}
                onClick={() => {
                  showAgain.mutate({ householdId, seriesId: item.id });
                }}
              >
                {t('hidden.showAgain')}
              </Button>
            </li>
          ))}
        </ul>
      </Collapse>
    </div>
  );
}
