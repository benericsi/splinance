import { useTranslation } from 'react-i18next';
import { type ErrorComponentProps, Link, useRouter } from '@tanstack/react-router';
import { Button, buttonVariants } from '@/components/ui/button';
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
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <StatusPage
      fullPage={fullPage}
      title={t('error.title')}
      description={t('error.description')}
      actions={
        <>
          <Button
            onClick={() => {
              // Clear the error boundary and re-run loaders for the current route.
              reset();
              void router.invalidate();
            }}
          >
            {t('tryAgain')}
          </Button>
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
