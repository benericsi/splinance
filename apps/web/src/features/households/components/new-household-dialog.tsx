import { useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { RouteDialog } from '@/components/route-dialog';
import { useCloseModal } from '@/lib/route-modal';
import { CreateHouseholdForm } from './create-household-form';

/** Opened from anywhere with `?modal=new-household` (see the _authenticated layout). */
export function NewHouseholdDialog() {
  const navigate = useNavigate();
  const close = useCloseModal(
    useCallback(() => {
      void navigate({ to: '.', search: (prev) => ({ ...prev, modal: undefined }), replace: true });
    }, [navigate]),
  );

  return (
    <RouteDialog
      title="New household"
      description="A shared space for expenses. You can invite people once it exists."
      onClose={close}
    >
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
