import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

/** Back to the first onboarding step (create or join). */
export function BackLink() {
  return (
    <Link to="/welcome" className={buttonVariants({ variant: 'ghost', className: '-ml-2.5' })}>
      <ArrowLeft aria-hidden />
      Back
    </Link>
  );
}
