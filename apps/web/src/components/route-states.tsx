import { useTranslation } from 'react-i18next';
import { type ErrorComponentProps, Link, useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { ApiError } from '@/lib/http';
import { StatusPage } from './status-page';

export function NotFoundPage({ fullPage = false }: { fullPage?: boolean }) {
  const { t } = useTranslation();
  return (
    <StatusPage
      fullPage={fullPage}
      code="404"
      title={t('notFound.title')}
      description={t('notFound.description')}
      actions={
        <Link to="/" className={buttonVariants()}>
          {t('backHome')}
        </Link>
      }
    />
  );
}

export function ErrorPage({
  error,
  reset,
  fullPage = false,
}: ErrorComponentProps & { fullPage?: boolean }) {
  const { t } = useTranslation(['common', 'errors']);
  const router = useRouter();
  const offline = error instanceof ApiError && error.code === 'NETWORK_ERROR';
  // Clear the error boundary and re-run loaders for the current route.
  const retry = () => {
    reset();
    void router.invalidate();
  };

  // Back online: nothing to press.
  useEffect(() => {
    if (!offline) return;
    window.addEventListener('online', retry);
    return () => {
      window.removeEventListener('online', retry);
    };
  });

  return (
    <StatusPage
      fullPage={fullPage}
      title={offline ? t('offline') : t('error.title')}
      description={offline ? t('errors:network') : t('error.description')}
      actions={
        <>
          <Button onClick={retry}>{t('tryAgain')}</Button>
          <Link to="/" className={buttonVariants({ variant: 'outline' })}>
            {t('backHome')}
          </Link>
        </>
      }
    >
      {import.meta.env.DEV && error instanceof Error && (
        <pre className="bg-muted text-muted-foreground mt-8 max-w-full overflow-auto rounded-lg p-4 text-left text-xs">
          {error.stack ?? error.message}
        </pre>
      )}
    </StatusPage>
  );
}
