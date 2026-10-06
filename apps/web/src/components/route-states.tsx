import { type ErrorComponentProps, Link, useRouter } from '@tanstack/react-router';
import { Button, buttonVariants } from '@/components/ui/button';
import { StatusPage } from './status-page';

export function NotFoundPage({ fullPage = false }: { fullPage?: boolean }) {
  return (
    <StatusPage
      fullPage={fullPage}
      code="404"
      title="Page not found"
      description="The page you are looking for does not exist or has been moved."
      actions={
        <Link to="/" className={buttonVariants()}>
          Back to home
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
  const router = useRouter();

  return (
    <StatusPage
      fullPage={fullPage}
      title="Something went wrong"
      description="An unexpected error occurred. Try again, or reload the page if it keeps happening."
      actions={
        <>
          <Button
            onClick={() => {
              // Clear the error boundary and re-run loaders for the current route.
              reset();
              void router.invalidate();
            }}
          >
            Try again
          </Button>
          <Link to="/" className={buttonVariants({ variant: 'outline' })}>
            Back to home
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
