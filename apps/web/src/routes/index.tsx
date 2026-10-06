import { noop } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { healthLiveQuery, healthReadyQuery } from '@/features/health/queries';
import { StatusPanel } from '@/features/health/status-panel';

export const Route = createFileRoute('/')({
  // Start fetching while the route loads; the component reads from the same cache.
  // Errors are swallowed here because the component renders them from the query state.
  loader: ({ context: { queryClient } }) => {
    void queryClient.query(healthLiveQuery).catch(noop);
    void queryClient.query(healthReadyQuery).catch(noop);
  },
  component: HomePage,
});

function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Household expenses, split fairly
        </h1>
        <p className="text-muted-foreground mt-1">
          Track shared and personal spending. Auth and households are next on the roadmap.
        </p>
      </div>
      <StatusPanel />
    </div>
  );
}
