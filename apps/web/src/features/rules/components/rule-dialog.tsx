import { type Category, type Rule, ruleInputSchema, rulePatternSchema } from '@splinance/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { revalidateLogic, useForm } from '@tanstack/react-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { firstError } from '@/components/form/first-error';
import { FormError } from '@/components/form/form-error';
import { TextField } from '@/components/form/text-field';
import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CategoryPicker } from '@/features/categories/components/category-picker';
import { ApiError } from '@/lib/http';
import { errorMessage } from '@/lib/query-client';
import { useApplyRule, useCreateRule, useUpdateRule } from '../hooks';
import { ruleQueries } from '../queries';

/** The form's own schema: a category must be picked (the shared one only knows uuids). */
const ruleFormSchema = z.object({
  pattern: rulePatternSchema,
  categoryId: z.string().min(1, 'Choose a category'),
  markShared: z.boolean(),
});

const transactionCount = (count: number) =>
  `${String(count)} earlier ${count === 1 ? 'transaction' : 'transactions'}`;

/**
 * Add or edit a rule: the text to look for, the category, and whether imported matches start
 * as shared. Editing shows how many earlier uncategorized transactions it would categorize,
 * with a button to do it; a new rule offers the same in its toast.
 */
export function RuleDialog({
  householdId,
  categories,
  rule,
  onClose,
}: {
  householdId: string;
  categories: Category[];
  /** Omitted when adding. */
  rule?: Rule | undefined;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const create = useCreateRule();
  const update = useUpdateRule();
  const apply = useApplyRule();
  const mutation = rule ? update : create;
  const active = categories.filter(
    (category) => category.archivedAt === null || category.id === rule?.categoryId,
  );
  const matches = useQuery({
    ...ruleQueries.matches(householdId, rule?.id ?? ''),
    enabled: rule !== undefined,
  });

  const form = useForm({
    defaultValues: {
      pattern: rule?.pattern ?? '',
      categoryId: rule?.categoryId ?? '',
      markShared: rule?.markShared ?? false,
    },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: ruleFormSchema },
    onSubmit: async ({ value }) => {
      const input = ruleInputSchema.parse(value);
      try {
        if (rule) {
          await update.mutateAsync({ householdId, ruleId: rule.id, input });
          toast.success('Rule saved');
          onClose();
          return;
        }
        const created = await create.mutateAsync({ householdId, input });
        onClose();
        // Offer the earlier matches right away; the toast outlives the dialog.
        const count = await queryClient.query(ruleQueries.matches(householdId, created.id));
        toast.success('Rule added', {
          ...(count > 0 && {
            description: `It matches ${transactionCount(count)} without a category.`,
            duration: 10_000,
            action: {
              label: 'Apply',
              onClick: () => {
                apply.mutate({ householdId, ruleId: created.id });
              },
            },
          }),
        });
      } catch {
        // Rendered from the mutation error below.
      }
    },
  });

  const taken = mutation.error instanceof ApiError && mutation.error.code === 'RULE_PATTERN_TAKEN';
  const formError = mutation.error && !taken ? errorMessage(mutation.error) : undefined;

  return (
    <RouteDialog title={rule ? 'Edit rule' : 'Add rule'} onClose={onClose}>
      <form
        noValidate
        className="min-w-0 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FormError message={formError} />

        <form.Field name="pattern">
          {(field) => (
            <TextField
              field={field}
              required
              label="When the merchant or description contains"
              placeholder="tesco"
              maxLength={60}
              autoFocus={!rule}
              serverError={taken ? 'There is a rule for this text already' : undefined}
              onValueChange={mutation.reset}
            />
          )}
        </form.Field>

        <form.Field name="categoryId">
          {(field) => {
            const error = firstError(field.state.meta.errors);
            return (
              <div className="space-y-1.5">
                <Label htmlFor="rule-category">Use category</Label>
                <CategoryPicker
                  id="rule-category"
                  categories={active}
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                />
                {error && <p className="text-destructive text-sm">{error}</p>}
              </div>
            );
          }}
        </form.Field>

        <form.Field name="markShared">
          {(field) => (
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={field.state.value}
                onChange={(event) => {
                  field.handleChange(event.target.checked);
                }}
                className="accent-primary size-4"
              />
              Mark imported matches as shared
            </label>
          )}
        </form.Field>

        {rule && matches.data !== undefined && matches.data > 0 && (
          <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm">
            <span>It matches {transactionCount(matches.data)} without a category.</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={apply.isPending}
              onClick={() => {
                apply.mutate({ householdId, ruleId: rule.id });
              }}
            >
              {apply.isPending ? 'Applying…' : 'Apply to them'}
            </Button>
          </div>
        )}

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <div className="flex justify-end pt-1">
              <Button type="submit" size="lg" className="min-w-28" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : rule ? 'Save' : 'Add rule'}
              </Button>
            </div>
          )}
        </form.Subscribe>
      </form>
    </RouteDialog>
  );
}
