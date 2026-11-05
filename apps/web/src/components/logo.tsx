import { Link } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { LogoMark } from './brand/logo-mark';

/** The product's name: the same in every language. */
const BRAND_NAME = 'Splinance';

/** Mark + "Splinance" wordmark; the wordmark inherits the current text color. */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn(
        'font-heading inline-flex items-center gap-2 text-xl font-extrabold tracking-tight',
        className,
      )}
    >
      <LogoMark className="size-8" />
      {BRAND_NAME}
    </Link>
  );
}
