import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { healthLiveQuery, healthReadyQuery } from './queries';

type Tone = 'success' | 'destructive' | 'secondary';

interface ServiceStatus {
  label: string;
  tone: Tone;
}

function StatusCard({
  title,
  description,
  status,
}: {
  title: string;
  description: string;
  status: ServiceStatus;
}) {
  return (
    <Card role="group" aria-label={title}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          {title}
          <Badge variant={status.tone}>{status.label}</Badge>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

export function StatusPanel() {
  const live = useQuery(healthLiveQuery);
  const ready = useQuery(healthReadyQuery);

  const apiStatus: ServiceStatus = live.isPending
    ? { label: 'Checking', tone: 'secondary' }
    : live.isError
      ? { label: 'Offline', tone: 'destructive' }
      : { label: 'Online', tone: 'success' };

  // If the API itself is down, the database state cannot be known.
  const dbStatus: ServiceStatus = live.isError
    ? { label: 'Unknown', tone: 'secondary' }
    : ready.isPending
      ? { label: 'Checking', tone: 'secondary' }
      : ready.isError
        ? { label: 'Unreachable', tone: 'destructive' }
        : { label: 'Connected', tone: 'success' };

  return (
    <section aria-label="System status" className="grid gap-4 sm:grid-cols-2">
      <StatusCard title="API" description="Express server on /api" status={apiStatus} />
      <StatusCard title="Database" description="PostgreSQL via the API" status={dbStatus} />
      <p className="text-muted-foreground text-sm sm:col-span-2">
        Checks refresh every 10 seconds.
      </p>
    </section>
  );
}
