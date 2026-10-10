import { AnimatePresence, m } from 'motion/react';
import type { ReactNode } from 'react';
import { COLLAPSE } from '@/lib/motion';

/**
 * Content that opens and closes by height (archived lists, sections that come and go).
 * Already open on the first render: only changes animate.
 */
export function Collapse({
  open,
  children,
  className,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <m.div key="collapse" {...COLLAPSE} className={className}>
          {children}
        </m.div>
      )}
    </AnimatePresence>
  );
}
