import type { CreateInviteResponse, Household, Invite } from '@splinance/shared';
import { useQuery } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { expiresIn } from '../format';
import { useCreateInvite, useRevokeInvite } from '../hooks';
import { inviteQueries } from '../queries';
import { InviteLinkCard } from './invite-link-card';

export function InviteDialog({
  household,
  onClose,
}: {
  household: Pick<Household, 'id' | 'name'>;
  onClose: () => void;
}) {
  const { t } = useTranslation('invites');
  const householdId = household.id;
  const create = useCreateInvite();
  const { data: invites = [], isPending } = useQuery(inviteQueries.list(householdId));
  // The raw token comes back only once, from the create call; reopening shows the list.
  const [created, setCreated] = useState<CreateInviteResponse | null>(null);

  return (
    <RouteDialog
      title={t('dialogTitle', { household: household.name })}
      description={t('dialogDescription')}
      onClose={onClose}
    >
      <div className="space-y-6">
        {created ? (
          <InviteLinkCard token={created.token} householdName={household.name} />
        ) : (
          <Button
            className="h-10 w-full"
            disabled={create.isPending}
            onClick={() => {
              create.mutate({ householdId }, { onSuccess: setCreated });
            }}
          >
            <Link2 aria-hidden />
            {create.isPending
              ? t('creating')
              : invites.length > 0
                ? t('createAnother')
                : t('create')}
          </Button>
        )}

        <section aria-labelledby="pending-invites" className="space-y-2">
          <h3 id="pending-invites" className="text-sm font-medium">
            {t('pending')}
          </h3>
          {isPending ? (
            <p className="text-muted-foreground text-sm">{t('loading')}</p>
          ) : invites.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('none')}</p>
          ) : (
            <ul className="divide-y">
              {invites.map((invite) => (
                <PendingInvite
                  key={invite.id}
                  householdId={householdId}
                  invite={invite}
                  onRevoked={() => {
                    if (created?.invite.id === invite.id) setCreated(null);
                  }}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </RouteDialog>
  );
}

function PendingInvite({
  householdId,
  invite,
  onRevoked,
}: {
  householdId: string;
  invite: Invite;
  onRevoked: () => void;
}) {
  const { t } = useTranslation('invites');
  const revoke = useRevokeInvite();
  const who = { name: invite.invitedBy.displayName, expires: expiresIn(invite.expiresAt) };

  return (
    <li className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <span className="text-muted-foreground min-w-0 text-sm">{t('by', who)}</span>
      <Button
        variant="ghost"
        size="sm"
        disabled={revoke.isPending}
        aria-label={t('revokeLabel', who)}
        onClick={() => {
          revoke.mutate(
            { householdId, inviteId: invite.id },
            {
              onSuccess: () => {
                onRevoked();
                toast.success(t('revoked'));
              },
            },
          );
        }}
      >
        {t('revoke')}
      </Button>
    </li>
  );
}
