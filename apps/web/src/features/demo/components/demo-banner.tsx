import { useQuery } from '@tanstack/react-query';
import { FlaskConical, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { deletedWhen } from '../expiry';
import { useStartOver } from '../hooks';
import { demoQueries } from '../queries';

/**
 * Above every household page on the demo site: this is demo data, when it is deleted, and
 * "Start over" for a fresh household. On desktop it sits level with the account menu.
 */
export function DemoBanner() {
  const { data } = useQuery(demoQueries.status());
  const startOver = useStartOver();
  const [confirming, setConfirming] = useState(false);

  return (
    <aside
      aria-label="Demo"
      className="bg-muted/50 mb-6 flex items-center justify-between gap-3 rounded-lg border py-1.5 pr-1.5 pl-3 text-sm md:mr-12"
    >
      <p className="flex min-w-0 items-center gap-2">
        <FlaskConical className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <span className="truncate">
          Demo data{data && <> · deleted {deletedWhen(data.expiresAt)}</>}
        </span>
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setConfirming(true);
        }}
      >
        <RotateCcw aria-hidden />
        Start over
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Start over?"
        description="This deletes the demo household with everything you changed in it and sets up a fresh one."
        confirmLabel="Start over"
        pendingLabel="Setting up…"
        pending={startOver.isPending}
        onConfirm={() => {
          startOver.mutate();
        }}
      />
    </aside>
  );
}
