import { noop } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { healthQueries } from '@/features/health/queries';
import { StatusPanel } from '@/features/health/status-panel';
import { useAuth } from '@/lib/auth-store';

export const Route = createFileRoute('/_authenticated/')({
  // Start fetching while the route loads; the component reads from the same cache.
  // Errors are swallowed here because the component renders them from the query state.
  loader: ({ context: { queryClient } }) => {
    void queryClient.query(healthQueries.live()).catch(noop);
    void queryClient.query(healthQueries.ready()).catch(noop);
  },
  component: HomePage,
});

function HomePage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Welcome, {user?.displayName}
        </h1>
        <p className="text-muted-foreground mt-1">
          Households and shared expenses are next on the roadmap.
        </p>
      </div>
      <StatusPanel />
    </div>
  );
}
