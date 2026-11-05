import { useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RouteDialog } from '@/components/route-dialog';
import { useCloseModal } from '@/lib/route-modal';
import { CreateHouseholdForm } from './create-household-form';

/** Opened from anywhere with `?modal=new-household` (see the _authenticated layout). */
export function NewHouseholdDialog() {
  const { t } = useTranslation('households');
  const navigate = useNavigate();
  const close = useCloseModal(
    useCallback(() => {
      void navigate({ to: '.', search: (prev) => ({ ...prev, modal: undefined }), replace: true });
    }, [navigate]),
  );

  return (
    <RouteDialog title={t('newTitle')} description={t('newDescription')} onClose={close}>
      <CreateHouseholdForm
        onCreated={async (household) => {
          // Replace the modal entry, so back from the new household returns to where it started.
          await navigate({
            to: '/h/$householdId',
            params: { householdId: household.id },
            replace: true,
          });
        }}
      />
    </RouteDialog>
  );
}
