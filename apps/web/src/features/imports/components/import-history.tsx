import { type ImportBatch, STATEMENT_SOURCE_LABELS } from '@splinance/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateWith } from '@/features/transactions/dates';
import { errorMessage } from '@/lib/query-client';
import { useUndoImport } from '../hooks';
import { importQueries } from '../queries';

const importDate = (iso: string) =>
  formatDateWith(new Date(iso), { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * The viewer's own imports, newest first, each undoable once (with a confirmation: it
 * deletes many transactions at once). Hidden while empty. The undo mutation and its dialog
 * live here, not in the row: the row loses its button once the import is undone, and
 * per-call callbacks of an unmounted component never run.
 */
export function ImportHistory({ householdId }: { householdId: string }) {
  const { t } = useTranslation(['imports', 'common']);
  const { data: batches } = useSuspenseQuery(importQueries.list(householdId));
  const undo = useUndoImport();
  const [confirming, setConfirming] = useState<ImportBatch | null>(null);
  if (batches.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('history.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {batches.map((batch) => (
            <li key={batch.id} className="flex min-h-11 items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className={batch.undoneAt ? 'text-muted-foreground' : undefined}>
                  {STATEMENT_SOURCE_LABELS[batch.source]} · {importDate(batch.createdAt)} ·{' '}
                  {t('history.transactions', { count: batch.rowCount })}
                  {batch.savingsCount > 0
                    ? ` · ${t('history.savings', { count: batch.savingsCount })}`
                    : ''}
                  {batch.undoneAt ? ` · ${t('history.undone')}` : ''}
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
                  {t('common:undo')}
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
        title={t('history.confirmTitle')}
        description={[
          t('history.confirmDescription', { count: confirming?.rowCount ?? 0 }),
          confirming?.savingsCount
            ? t('history.confirmSavings', { count: confirming.savingsCount })
            : '',
        ]
          .join(' ')
          .trim()}
        confirmLabel={t('done.undo')}
        pendingLabel={t('done.undoing')}
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
                toast.success(t('done.undone'));
              },
            },
          );
        }}
      />
    </Card>
  );
}
