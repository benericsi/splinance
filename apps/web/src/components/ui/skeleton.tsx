import * as React from 'react';
import { cn } from 'cn';

/**
 * A grey block standing in for content that is loading. A tint of the foreground, so it
 * shows on the page and on cards in both themes; pulses unless reduced motion is on.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn('bg-foreground/[0.07] rounded-md motion-safe:animate-pulse', className)}
      {...props}
    />
  );
}

export { Skeleton };
