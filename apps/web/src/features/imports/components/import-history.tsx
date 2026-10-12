import { type ImportBatch, STATEMENT_SOURCE_LABELS } from '@splinance/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { errorMessage } from '@/lib/query-client';
import { useUndoImport } from '../hooks';
import { importQueries } from '../queries';

const importDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const transactionCount = (count: number) =>
  `${String(count)} ${count === 1 ? 'transaction' : 'transactions'}`;

/**
 * The viewer's own imports, newest first, each undoable once (with a confirmation: it
 * deletes many transactions at once). Hidden while empty. The undo mutation and its dialog
 * live here, not in the row: the row loses its button once the import is undone, and
 * per-call callbacks of an unmounted component never run.
 */
export function ImportHistory({ householdId }: { householdId: string }) {
  const { data: batches } = useSuspenseQuery(importQueries.list(householdId));
  const undo = useUndoImport();
  const [confirming, setConfirming] = useState<ImportBatch | null>(null);
  if (batches.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your imports</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {batches.map((batch) => (
            <li key={batch.id} className="flex min-h-11 items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className={batch.undoneAt ? 'text-muted-foreground' : undefined}>
                  {STATEMENT_SOURCE_LABELS[batch.source]} · {importDate(batch.createdAt)} ·{' '}
                  {transactionCount(batch.rowCount)}
                  {batch.undoneAt ? ' · undone' : ''}
                </p>
                {batch.fileName && (
                  <p className="text-muted-foreground truncate text-xs">{batch.fileName}</p>
                )}
              </div>
              {!batch.undoneAt && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setConfirming(batch);
                  }}
                >
                  Undo
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirming(null);
            undo.reset();
          }
        }}
        title="Undo this import?"
        description={`The ${transactionCount(confirming?.rowCount ?? 0)} it added are deleted, edited ones too. You can import the file again later.`}
        confirmLabel="Undo import"
        pendingLabel="Undoing…"
        destructive
        pending={undo.isPending}
        error={undo.error ? errorMessage(undo.error) : undefined}
        onConfirm={() => {
          if (!confirming) return;
          undo.mutate(
            { householdId, importId: confirming.id },
            {
              onSuccess: () => {
                setConfirming(null);
                toast.success('Import undone');
              },
            },
          );
        }}
      />
    </Card>
  );
}
