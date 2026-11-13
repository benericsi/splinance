import type { SavingsGoal } from '@splinance/shared';
import { Check, Flag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { barSegments, goalProgress, MILESTONES } from '../view';

/**
 * A goal's progress: the filled part split by who put the money in. With `milestones` the
 * steps on the way are marked on it (a check once passed) and a flag stands at the target.
 * Decoration only: the text next to it says the same in words.
 */
export function GoalBar({
  goal,
  fills,
  milestones = false,
}: {
  goal: SavingsGoal;
  /** A fill class per member (`memberFills`). */
  fills: Map<string, string>;
  milestones?: boolean;
}) {
  const segments = barSegments(goal);
  const track = (
    <div
      className={cn('bg-muted flex overflow-hidden rounded-full', milestones ? 'h-2.5' : 'h-1.5')}
    >
      {segments.map((segment) => (
        <div
          key={segment.userId}
          className={cn(
            'not-last:border-background transition-[width] duration-200 not-last:border-r-2 motion-reduce:transition-none',
            fills.get(segment.userId) ?? 'bg-positive',
          )}
          style={{ width: `${String(segment.fraction * 100)}%` }}
        />
      ))}
    </div>
  );
  if (!milestones || goal.targetAmount === null) return <div aria-hidden>{track}</div>;

  const { passed, reached } = goalProgress(goal);
  return (
    // Room on the right for the flag, so the last step does not sit under it.
    <div className="relative flex h-6 items-center pr-7" aria-hidden>
      <div className="relative flex-1">
        {track}
        {MILESTONES.filter((percent) => percent < 100).map((percent) => {
          const done = passed.includes(percent);
          return (
            <span
              key={percent}
              data-milestone={done ? 'passed' : 'ahead'}
              className={cn(
                'ring-card absolute top-1/2 flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ring-2',
                done ? 'bg-foreground text-background' : 'bg-card border-border border-2',
              )}
              style={{ left: `${String(percent)}%` }}
            >
              {done && <Check className="size-2.5" strokeWidth={3} />}
            </span>
          );
        })}
      </div>
      <Flag
        className={cn(
          'absolute right-0 size-4',
          reached ? 'text-positive' : 'text-muted-foreground',
        )}
      />
    </div>
  );
}
