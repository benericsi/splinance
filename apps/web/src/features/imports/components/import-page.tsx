import {
  type Category,
  type HouseholdDetail,
  type ImportResponse,
  parseStatement,
  type RecurringSeries,
  type Rule,
  STATEMENT_SOURCE_LABELS,
  StatementError,
  type StatementSource,
} from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { CircleCheck, FileSpreadsheet } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormError } from '@/components/form/form-error';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatShortDate } from '@/features/transactions/dates';
import { i18n } from '@/i18n';
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
import { SampleExportButton } from '@/features/demo/components/sample-export-button';
import { seriesForRow } from '@/features/recurring/match';

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

const dayLabel = (value: string | undefined) => (value ? formatShortDate(value) : '');

/** A parse problem in the UI language, with the line it is on. */
function statementProblem(error: StatementError): string {
  const { problem } = error;
  const message =
    problem.code === 'missing-column'
      ? i18n.t('imports:problems.missing-column', { bank: problem.bank, column: problem.column })
      : problem.code === 'unreadable-amount' || problem.code === 'unreadable-date'
        ? i18n.t(`imports:problems.${problem.code}`, { value: problem.value })
        : i18n.t(`imports:problems.${problem.code}`);
  return error.line === undefined
    ? message
    : i18n.t('imports:problems.line', { line: error.line, message });
}

/**
 * Pick a bank export, review its rows grouped by what needs a decision, import the picked
 * ones. The file is read and parsed here, in the browser; only normalized rows go to the
 * API (first to check them against what is there, then to import).
 */
export function ImportPage({
  household,
  categories,
  rules,
  series,
  viewerId,
}: {
  household: HouseholdDetail;
  categories: Category[];
  rules: Rule[];
  /** The viewer's recurring payments: rows that will count for one say so. */
  series: RecurringSeries[];
  viewerId: string;
}) {
  // Rules whose category was archived since stay listed in settings but do nothing.
  const activeRules = rules.filter((rule) =>
    categories.some((category) => category.id === rule.categoryId && category.archivedAt === null),
  );
  const { t } = useTranslation(['imports', 'common']);
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
      setProblem(
        error instanceof StatementError ? statementProblem(error) : t('problems.unreadable'),
      );
      return;
    }
    if (parsed.accountHolder) {
      rememberBankName(viewerId, parsed.accountHolder);
      setBankName(parsed.accountHolder);
    }
    if (parsed.rows.length === 0) {
      setProblem(t('problems.noRows'));
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
                {t('done.imported', { count: batch.rowCount })}
              </p>
            </div>
            {skipped > 0 && (
              <p className="text-muted-foreground">{t('done.skipped', { count: skipped })}</p>
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
                {t('done.viewTransactions')}
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
                        toast.success(t('done.undone'));
                        setStage({ step: 'pick' });
                      },
                    },
                  );
                }}
              >
                {undo.isPending ? t('done.undoing') : t('done.undo')}
              </Button>
              <Button
                variant="ghost"
                size="lg"
                onClick={() => {
                  setStage({ step: 'pick' });
                }}
              >
                {t('done.another')}
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
                {t('file.summary', {
                  source: STATEMENT_SOURCE_LABELS[review.source],
                  count: review.rows.length,
                  from: dayLabel(review.firstDay),
                  to: dayLabel(review.lastDay),
                })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor={nameId} className="text-muted-foreground font-normal">
                {t('file.bankName')}
              </Label>
              <Input
                id={nameId}
                value={bankName}
                placeholder={t('file.bankNamePlaceholder')}
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
              {t('file.another')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <FileDrop onFile={(file) => void onFile(file)} disabled={reading || check.isPending} />
          {__DEMO_SITE__ && (
            <SampleExportButton
              onFile={(file) => void onFile(file)}
              disabled={reading || check.isPending}
            />
          )}
        </>
      )}

      <FormError message={problem} />
      {(reading || check.isPending) && (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {t('file.checking')}
        </p>
      )}

      {review && (
        <>
          <ReviewList
            rows={review.rows}
            categories={categories}
            seriesOf={(item) =>
              seriesForRow(
                series,
                {
                  kind: item.row.kind,
                  visibility: item.visibility,
                  amount: item.row.amount,
                  occurredOn: item.row.occurredOn,
                  counterparty: item.row.counterparty,
                  description: item.description,
                },
                viewerId,
              )
            }
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
                  {t('checkAgain')}
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
                {create.isPending ? t('importing') : t('submit', { count: picked })}
              </Button>
            </div>
          </div>
        </>
      )}

      {!review && <ImportHistory householdId={household.id} />}
    </div>
  );
}
