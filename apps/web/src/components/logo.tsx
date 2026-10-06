import type { BrandPairing } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { LogoMark } from './brand/logo-mark';

interface LogoProps {
  className?: string;
  /** Mark colors; the wordmark inherits the current text color. */
  pairing?: BrandPairing;
  tile?: boolean;
}

export function Logo({ className, pairing, tile = true }: LogoProps) {
  return (
    <Link
      to="/"
      className={cn(
        'font-heading inline-flex items-center gap-2 text-xl font-extrabold tracking-tight',
        className,
      )}
    >
      <LogoMark pairing={pairing} tile={tile} className={tile ? 'size-8' : 'h-8 w-6'} />
      Splinance
    </Link>
  );
}
