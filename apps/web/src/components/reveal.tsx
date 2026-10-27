import { m } from 'motion/react';
import { type ReactNode, useContext, useEffect, useLayoutEffect, useState } from 'react';
import { REVEAL, REVEAL_STAGGER, REVEAL_WINDOW_MS, TRANSITION } from '@/lib/motion';
import { RevealContext, skeletonFlag } from '@/lib/reveal';
import { cn } from '@/lib/utils';

/** A route's loading state: the page's static header plus skeleton blocks. */
export function PageSkeleton({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    skeletonFlag.set(true);
  }, []);
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        Loading…
      </span>
      {children}
    </div>
  );
}

/**
 * Wraps a page whose sections use `Reveal`; decides once, on mount, whether they animate:
 * only when a skeleton stood in for the page (see `lib/reveal.ts`).
 */
export function RevealPage({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(skeletonFlag.get);
  useEffect(() => {
    skeletonFlag.set(false);
    if (!active) return;
    // After the entrance, rows that show up are added ones and collapse open as before.
    const timer = setTimeout(() => {
      setActive(false);
    }, REVEAL_WINDOW_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [active]);
  return <RevealContext value={{ active, delay: 0 }}>{children}</RevealContext>;
}

/**
 * A section of a revealing page: fades in and rises, `index` steps after the first. Hidden
 * when its content renders nothing, so it adds no gap to the page.
 */
export function Reveal({
  index,
  className,
  children,
}: {
  index: number;
  className?: string;
  children: ReactNode;
}) {
  const { active } = useContext(RevealContext);
  const delay = index * REVEAL_STAGGER;
  return (
    <RevealContext value={{ active, delay }}>
      <m.div
        initial={active ? REVEAL.initial : false}
        animate={REVEAL.animate}
        transition={{ ...TRANSITION, delay }}
        className={cn('empty:hidden', className)}
      >
        {children}
      </m.div>
    </RevealContext>
  );
}
