import type { Budget } from '@splinance/shared';
import { budgetUsage } from '@splinance/shared';
import { m, useReducedMotion } from 'motion/react';
import { TRANSITION, TRANSITION_GROW } from '@/lib/motion';
import { useReveal } from '@/lib/reveal';
import { cn } from '@/lib/utils';
import { budgetStatus } from '../status';

/**
 * How much of the budget is used. Neutral below 80%, mustard near the limit, red over it.
 * Brand colors are fills only; the text next to it says the same in words, so the bar is
 * decorative for screen readers. Grows from empty when its page replaces a skeleton (not
 * with reduced motion: width is not a transform, so MotionConfig would not skip it), and
 * eases to new amounts.
 */
export function BudgetBar({ budget }: { budget: Pick<Budget, 'amount' | 'spent'> }) {
  const status = budgetStatus(budget);
  const reveal = useReveal();
  const reducedMotion = useReducedMotion();
  const grow = reveal.active && !reducedMotion;
  const width = `${String(Math.min(100, budgetUsage(budget) * 100))}%`;
  return (
    <div className="bg-muted h-2 overflow-hidden rounded-full" aria-hidden>
      <m.div
        className={cn(
          'h-full rounded-full',
          status === 'ok' && 'bg-foreground/45',
          status === 'near' && 'bg-brand-mustard',
          status === 'over' && 'bg-brand-red',
        )}
        initial={grow ? { width: 0 } : false}
        animate={{ width }}
        transition={grow ? { ...TRANSITION_GROW, delay: reveal.delay + 0.1 } : TRANSITION}
      />
    </div>
  );
}
