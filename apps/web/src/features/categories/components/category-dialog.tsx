import {
  type Category,
  type CategoryKind,
  type CreateCategoryInput,
  createCategoryInputSchema,
  updateCategoryInputSchema,
} from '@splinance/shared';
import { revalidateLogic, useForm } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormError } from '@/components/form/form-error';
import { TextField } from '@/components/form/text-field';
import { RouteDialog } from '@/components/route-dialog';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/http';
import { errorMessage } from '@/lib/query-client';
import { suggestColor } from '../appearance';
import { useCreateCategory, useUpdateCategory } from '../hooks';
import { ColorPicker, IconPicker } from './appearance-pickers';
import { CategoryTile } from './category-tile';

/** Create (with a kind) or edit (name, color, icon; the kind is fixed once created). */
export function CategoryDialog({
  householdId,
  categories,
  category,
  initialKind = 'expense',
  onClose,
}: {
  householdId: string;
  /** All of the household's categories, for the suggested color. */
  categories: Category[];
  /** Omitted when creating. */
  category?: Category | undefined;
  initialKind?: CategoryKind;
  onClose: () => void;
}) {
  const { t } = useTranslation(['categories', 'common', 'errors']);
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const mutation = category ? update : create;
  const kindLabel = (kind: CategoryKind) => (kind === 'expense' ? t('expense') : t('incomeKind'));

  const defaultValues: CreateCategoryInput = category
    ? { name: category.name, kind: category.kind, icon: category.icon, color: category.color }
    : { name: '', kind: initialKind, icon: 'tag', color: suggestColor(categories, initialKind) };

  const form = useForm({
    defaultValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: createCategoryInputSchema },
    onSubmit: async ({ value }) => {
      try {
        if (category) {
          const { name, icon, color } = updateCategoryInputSchema.parse(value);
          await update.mutateAsync({
            householdId,
            categoryId: category.id,
            input: { name, icon, color },
          });
          toast.success(t('saved'));
        } else {
          await create.mutateAsync({ householdId, input: createCategoryInputSchema.parse(value) });
          toast.success(t('added'));
        }
        onClose();
      } catch {
        // Rendered from the mutation error below.
      }
    },
  });

  const nameTaken =
    mutation.error instanceof ApiError && mutation.error.code === 'CATEGORY_NAME_TAKEN';
  const formError = mutation.error && !nameTaken ? errorMessage(mutation.error) : undefined;

  return (
    <RouteDialog title={category ? t('editTitle') : t('newTitle')} onClose={onClose}>
      <form
        noValidate
        className="min-w-0 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FormError message={formError} />

        {/* Live preview of the tile as it will appear on transactions. */}
        <form.Subscribe
          selector={(state) => ({ icon: state.values.icon, color: state.values.color })}
        >
          {(appearance) => (
            <div className="flex justify-center">
              <CategoryTile category={appearance} className="size-14 rounded-2xl [&_svg]:size-7" />
            </div>
          )}
        </form.Subscribe>

        {category ? (
          <p className="text-muted-foreground text-center text-sm">
            {t(`kindCategory_${category.kind}`)}
          </p>
        ) : (
          <form.Field name="kind">
            {(field) => (
              <SegmentedControl
                label={t('type')}
                value={field.state.value}
                onChange={(kind) => {
                  field.handleChange(kind);
                  // Keep the suggestion fresh unless the color was picked by hand.
                  if (!form.getFieldMeta('color')?.isDirty) {
                    form.setFieldValue('color', suggestColor(categories, kind), {
                      dontUpdateMeta: true,
                    });
                  }
                }}
                options={[
                  { value: 'expense', label: kindLabel('expense') },
                  { value: 'income', label: kindLabel('income') },
                ]}
              />
            )}
          </form.Field>
        )}

        <form.Field name="name">
          {(field) => (
            <TextField
              field={field}
              required
              label={t('name')}
              placeholder={t('namePlaceholder')}
              maxLength={40}
              autoFocus={!category}
              serverError={nameTaken ? t('errors:codes.CATEGORY_NAME_TAKEN') : undefined}
              onValueChange={mutation.reset}
            />
          )}
        </form.Field>

        <form.Field name="color">
          {(field) => <ColorPicker value={field.state.value} onChange={field.handleChange} />}
        </form.Field>

        <form.Field name="icon">
          {(field) => <IconPicker value={field.state.value} onChange={field.handleChange} />}
        </form.Field>

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <div className="flex justify-end pt-1">
              <Button type="submit" size="lg" className="min-w-28" disabled={isSubmitting}>
                {isSubmitting ? t('common:saving') : category ? t('common:save') : t('add')}
              </Button>
            </div>
          )}
        </form.Subscribe>
      </form>
    </RouteDialog>
  );
}
