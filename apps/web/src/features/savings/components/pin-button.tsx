import type { SavingsGoal } from '@splinance/shared';
import { Pin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSetGoalPinned } from '../hooks';

/**
 * Keeps a goal on top of the viewer's own page, or lets it go. A toggle button: pressed
 * while pinned. Refusals (the limit of three) show in the global toast.
 */
export function PinButton({
  householdId,
  goal,
  className,
}: {
  householdId: string;
  goal: SavingsGoal;
  className?: string;
}) {
  const { t } = useTranslation('savings');
  const setPinned = useSetGoalPinned();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-pressed={goal.pinned}
      aria-label={t(goal.pinned ? 'unpin' : 'pin', { name: goal.name })}
      disabled={setPinned.isPending}
      className={cn(goal.pinned ? 'text-foreground' : 'text-muted-foreground', className)}
      onClick={() => {
        setPinned.mutate({ householdId, goalId: goal.id, pinned: !goal.pinned });
      }}
    >
      <Pin className={cn(goal.pinned && 'fill-current')} aria-hidden />
    </Button>
  );
}
