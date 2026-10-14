import {
  type Category,
  type HouseholdDetail,
  type ImportResponse,
  type Rule,
  parseStatement,
  STATEMENT_SOURCE_LABELS,
  StatementError,
  type StatementSource,
} from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { CircleCheck, FileSpreadsheet } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { FormError } from '@/components/form/form-error';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/http';
import { errorMessage } from '@/lib/query-client';
import { readBankNames, rememberBankName } from '../bank-names';
import { useCheckImport, useCreateImport, useUndoImport } from '../hooks';
import { readExport } from '../read-file';
import { buildReview, type ReviewRow, rowsToCheck, toImportInput, updatePicked } from '../review';
import { suggestRules } from '../suggestions';
import { FileDrop } from './file-drop';
import { ImportHistory } from './import-history';
import { ReviewList } from './review-list';
import { RuleSuggestions } from './rule-suggestions';

interface Review {
  fileName: string;
  text: string;
  source: StatementSource;
  firstDay: string | undefined;
  lastDay: string | undefined;
  rows: ReviewRow[];
}

type Stage =
  | { step: 'pick' }
  | ({ step: 'review' } & Review)
  | { step: 'done'; result: ImportResponse; imported: ReviewRow[] };

const dayLabel = (value: string | undefined) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : '';

/**
 * Pick a bank export, review its rows grouped by what needs a decision, import the picked
 * ones. The file is read and parsed here, in the browser; only normalized rows go to the
 * API (first to check them against what is there, then to import).
 */
export function ImportPage({
  household,
  categories,
  rules,
  viewerId,
}: {
  household: HouseholdDetail;
  categories: Category[];
  rules: Rule[];
  viewerId: string;
}) {
  // Rules whose category was archived since stay listed in settings but do nothing.
  const activeRules = rules.filter((rule) =>
    categories.some((category) => category.id === rule.categoryId && category.archivedAt === null),
  );
  const currency = household.baseCurrency;
  const nameId = useId();
  const [stage, setStage] = useState<Stage>({ step: 'pick' });
  const [bankName, setBankName] = useState(() => readBankNames(viewerId)[0] ?? '');
  const [problem, setProblem] = useState<string>();
  const [reading, setReading] = useState(false);
  const check = useCheckImport();
  const create = useCreateImport();
  const undo = useUndoImport();

  /** Parses, checks against the API and builds the review. Runs again when the name changes. */
  const analyze = async (text: string, fileName: string, name: string) => {
    setProblem(undefined);
    create.reset();
    let parsed;
    try {
      parsed = parseStatement(text, { ownNames: name.trim() ? [name] : [], currency });
    } catch (error) {
      setProblem(error instanceof StatementError ? error.message : 'This file could not be read.');
      return;
    }
    if (parsed.accountHolder) {
      rememberBankName(viewerId, parsed.accountHolder);
      setBankName(parsed.accountHolder);
    }
    if (parsed.rows.length === 0) {
      setProblem('There are no transactions in this file.');
      return;
    }

    const toCheck = rowsToCheck(parsed.rows, currency);
    let results: Awaited<ReturnType<typeof check.mutateAsync>> = [];
    try {
      if (toCheck.length > 0)
        results = await check.mutateAsync({ householdId: household.id, input: { rows: toCheck } });
    } catch (error) {
      setProblem(errorMessage(error));
      return;
    }
    const days = parsed.rows.map((row) => row.occurredOn).sort();
    setStage({
      step: 'review',
      fileName,
      text,
      source: parsed.source,
      firstDay: days[0],
      lastDay: days.at(-1),
      rows: buildReview(parsed.rows, results, currency, activeRules),
    });
  };

  const onFile = async (file: File) => {
    setReading(true);
    try {
      await analyze(await readExport(file), file.name, bankName);
    } finally {
      setReading(false);
    }
  };

  if (stage.step === 'done') {
    const { batch, skipped } = stage.result;
    const suggestions = suggestRules(stage.imported, rules);
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <CircleCheck className="text-positive size-6 shrink-0" aria-hidden />
              <p className="font-heading text-lg font-semibold">
                {batch.rowCount} {batch.rowCount === 1 ? 'transaction' : 'transactions'} imported
              </p>
            </div>
            {skipped > 0 && (
              <p className="text-muted-foreground">
                {skipped} {skipped === 1 ? 'was' : 'were'} there already and{' '}
                {skipped === 1 ? 'was' : 'were'} skipped.
              </p>
            )}
            <RuleSuggestions
              householdId={household.id}
              suggestions={suggestions}
              categories={categories}
            />
            <div className="flex flex-wrap gap-2">
              <Link
                to="/h/$householdId/transactions"
                params={{ householdId: household.id }}
                className={buttonVariants({ size: 'lg' })}
              >
                View transactions
              </Link>
              <Button
                variant="outline"
                size="lg"
                disabled={undo.isPending}
                onClick={() => {
                  undo.mutate(
                    { householdId: household.id, importId: batch.id },
                    {
                      onSuccess: () => {
                        toast.success('Import undone');
                        setStage({ step: 'pick' });
                      },
                    },
                  );
                }}
              >
                {undo.isPending ? 'Undoing…' : 'Undo import'}
              </Button>
              <Button
                variant="ghost"
                size="lg"
                onClick={() => {
                  setStage({ step: 'pick' });
                }}
              >
                Import another file
              </Button>
            </div>
          </CardContent>
        </Card>
        <ImportHistory householdId={household.id} />
      </div>
    );
  }

  const review = stage.step === 'review' ? stage : undefined;
  const picked = review?.rows.filter((row) => row.included && row.group !== 'left-out').length ?? 0;
  const conflict =
    create.error instanceof ApiError &&
    (create.error.code === 'IMPORT_CONFLICT' || create.error.code === 'NOTHING_TO_IMPORT');

  const setRows = (update: (rows: ReviewRow[]) => ReviewRow[]) => {
    setStage((current) =>
      current.step === 'review' ? { ...current, rows: update(current.rows) } : current,
    );
  };

  const submit = async () => {
    if (!review) return;
    try {
      const result = await create.mutateAsync({
        householdId: household.id,
        input: toImportInput(review.rows, {
          source: review.source,
          fileName: review.fileName,
          viewerId,
          memberIds: household.members.map((member) => member.userId),
        }),
      });
      setStage({
        step: 'done',
        result,
        imported: review.rows.filter((row) => row.included && row.group !== 'left-out'),
      });
    } catch {
      // Shown next to the button.
    }
  };

  return (
    <div className="space-y-6">
      {review ? (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <FileSpreadsheet className="size-5 shrink-0" aria-hidden />
            <div className="min-w-48 flex-1">
              <p className="truncate">{review.fileName}</p>
              <p className="text-muted-foreground text-sm">
                {STATEMENT_SOURCE_LABELS[review.source]} · {review.rows.length} rows ·{' '}
                {dayLabel(review.firstDay)} to {dayLabel(review.lastDay)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor={nameId} className="text-muted-foreground font-normal">
                Your name at the bank
              </Label>
              <Input
                id={nameId}
                value={bankName}
                placeholder="KOVÁCS ANNA"
                className="h-8 w-40"
                onChange={(event) => {
                  setBankName(event.target.value);
                }}
                onBlur={() => {
                  rememberBankName(viewerId, bankName);
                  void analyze(review.text, review.fileName, bankName);
                }}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStage({ step: 'pick' });
              }}
            >
              Choose another file
            </Button>
          </CardContent>
        </Card>
      ) : (
        <FileDrop onFile={(file) => void onFile(file)} disabled={reading || check.isPending} />
      )}

      <FormError message={problem} />
      {(reading || check.isPending) && (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          Checking the rows…
        </p>
      )}

      {review && (
        <>
          <ReviewList
            rows={review.rows}
            categories={categories}
            onChange={(key, patch) => {
              setRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
            }}
            onBulk={(patch, onlyKind) => {
              setRows((rows) => updatePicked(rows, patch, onlyKind));
            }}
          />
          <div className="space-y-3">
            {conflict ? (
              <div className="flex flex-wrap items-center gap-3">
                <FormError message={errorMessage(create.error)} />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void analyze(review.text, review.fileName, bankName)}
                >
                  Check again
                </Button>
              </div>
            ) : (
              <FormError message={create.error ? errorMessage(create.error) : undefined} />
            )}
            <div className="flex justify-end">
              <Button
                size="lg"
                disabled={picked === 0 || create.isPending}
                onClick={() => void submit()}
                className="max-sm:w-full"
              >
                {create.isPending
                  ? 'Importing…'
                  : `Import ${String(picked)} ${picked === 1 ? 'transaction' : 'transactions'}`}
              </Button>
            </div>
          </div>
        </>
      )}

      {!review && <ImportHistory householdId={household.id} />}
    </div>
  );
}
