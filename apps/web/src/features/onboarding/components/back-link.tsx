import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '@/components/ui/button';

/** Back to the first onboarding step (create or join). */
export function BackLink() {
  const { t } = useTranslation('onboarding');
  return (
    <Link to="/welcome" className={buttonVariants({ variant: 'ghost', className: '-ml-2.5' })}>
      <ArrowLeft aria-hidden />
      {t('back')}
    </Link>
  );
}
