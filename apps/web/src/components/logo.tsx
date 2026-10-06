import { Link } from '@tanstack/react-router';
import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn('font-heading inline-flex items-center gap-2 text-lg font-semibold', className)}
    >
      <img src="/favicon.svg" alt="" className="size-6" />
      Splinance
    </Link>
  );
}
