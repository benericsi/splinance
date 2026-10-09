import type { HouseholdDetail, HouseholdMember } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { Ellipsis, ShieldCheck, ShieldMinus, UserMinus, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserAvatar } from '@/components/user-avatar';
import { useAuth } from '@/lib/auth-store';
import { errorMessage } from '@/lib/query-client';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import { useRemoveMember, useUpdateMemberRole } from '../hooks';

const ROLE_LABELS = { owner: 'Owner', member: 'Member' } as const;

export function MemberList({ household }: { household: HouseholdDetail }) {
  const { user } = useAuth();
  const isOwner = household.role === 'owner';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        {isOwner && (
          <CardAction>
            <Link
              to="/h/$householdId/settings/invite"
              params={{ householdId: household.id }}
              state={OPEN_MODAL_STATE}
              className={buttonVariants({ variant: 'outline' })}
            >
              <UserPlus aria-hidden />
              Invite
            </Link>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {household.members.map((member) => {
            const isSelf = member.userId === user?.id;
            return (
              <li key={member.userId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <UserAvatar user={{ id: member.userId, displayName: member.displayName }} />
                <span className="min-w-0 flex-1 truncate">
                  {member.displayName}
                  {isSelf && <span className="text-muted-foreground"> (you)</span>}
                </span>
                <Badge variant={member.role === 'owner' ? 'secondary' : 'outline'}>
                  {ROLE_LABELS[member.role]}
                </Badge>
                {/* Your own membership is changed from the danger zone (leave). */}
                {isOwner && !isSelf ? (
                  <MemberActions householdId={household.id} member={member} />
                ) : (
                  isOwner && <span className="size-8" aria-hidden />
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function MemberActions({ householdId, member }: { householdId: string; member: HouseholdMember }) {
  const updateRole = useUpdateMemberRole();
  const remove = useRemoveMember();
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const name = member.displayName;
  const nextRole = member.role === 'owner' ? 'member' : 'owner';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label={`Actions for ${name}`} />}
        >
          <Ellipsis aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem
            onClick={() => {
              updateRole.mutate(
                { householdId, userId: member.userId, role: nextRole },
                {
                  onSuccess: () => {
                    toast.success(
                      nextRole === 'owner' ? `${name} is now an owner` : `${name} is now a member`,
                    );
                  },
                },
              );
            }}
          >
            {nextRole === 'owner' ? <ShieldCheck aria-hidden /> : <ShieldMinus aria-hidden />}
            {nextRole === 'owner' ? 'Make owner' : 'Make member'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              setConfirmingRemove(true);
            }}
          >
            <UserMinus aria-hidden />
            Remove from household
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmingRemove}
        onOpenChange={(open) => {
          setConfirmingRemove(open);
          if (!open) remove.reset();
        }}
        title={`Remove ${name}?`}
        description="They lose access to this household and its expenses. You can invite them again later."
        confirmLabel="Remove"
        pendingLabel="Removing…"
        destructive
        pending={remove.isPending}
        error={remove.error ? errorMessage(remove.error) : undefined}
        onConfirm={() => {
          remove.mutate(
            { householdId, userId: member.userId },
            {
              onSuccess: () => {
                setConfirmingRemove(false);
                toast.success(`${name} was removed`);
              },
            },
          );
        }}
      />
    </>
  );
}
