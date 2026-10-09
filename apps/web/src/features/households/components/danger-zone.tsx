import type { HouseholdDetail } from '@splinance/shared';
import { useNavigate } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/lib/query-client';
import { useArchiveHousehold, useLeaveHousehold } from '../hooks';

export function DangerZone({ household }: { household: HouseholdDetail }) {
  const isOwner = household.role === 'owner';

  return (
    <Card className="ring-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        <DangerRow
          title="Leave household"
          description="You lose access to its expenses. Someone can invite you again."
        >
          <LeaveButton household={household} />
        </DangerRow>
        {isOwner && (
          <DangerRow
            title="Archive household"
            description="Hides it for every member. Its history is kept."
          >
            <ArchiveButton household={household} />
          </DangerRow>
        )}
      </CardContent>
    </Card>
  );
}

function DangerRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {children}
    </div>
  );
}

function LeaveButton({ household }: { household: HouseholdDetail }) {
  const navigate = useNavigate();
  const leave = useLeaveHousehold();
  const [open, setOpen] = useState(false);
  const owners = household.members.filter((m) => m.role === 'owner').length;
  // The API refuses this too (LAST_OWNER); explaining it up front saves a failed request.
  const isLastOwner = household.role === 'owner' && owners <= 1;

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        Leave
      </Button>
      {isLastOwner ? (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="You're the only owner"
          description="A household always needs an owner. Make another member an owner first, or archive the household."
        />
      ) : (
        <ConfirmDialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) leave.reset();
          }}
          title={`Leave ${household.name}?`}
          description="You lose access to its expenses. Someone can invite you again."
          confirmLabel="Leave"
          pendingLabel="Leaving…"
          destructive
          pending={leave.isPending}
          error={leave.error ? errorMessage(leave.error) : undefined}
          onConfirm={() => {
            leave.mutate(
              { householdId: household.id },
              {
                onSuccess: () => {
                  toast.success(`You left ${household.name}`);
                  void navigate({ to: '/', replace: true });
                },
              },
            );
          }}
        />
      )}
    </>
  );
}

function ArchiveButton({ household }: { household: HouseholdDetail }) {
  const navigate = useNavigate();
  const archive = useArchiveHousehold();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const inputId = useId();
  const errorId = `${inputId}-error`;

  return (
    <>
      <Button
        variant="destructive"
        onClick={() => {
          setOpen(true);
        }}
      >
        Archive
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setTyped('');
            setMismatch(false);
            archive.reset();
          }
        }}
        title={`Archive ${household.name}?`}
        description="It disappears for every member. Expenses and history are kept, but nobody can open it anymore."
        confirmLabel="Archive"
        pendingLabel="Archiving…"
        destructive
        pending={archive.isPending}
        error={archive.error ? errorMessage(archive.error) : undefined}
        onConfirm={() => {
          // A typed confirmation, because this affects everyone in the household.
          if (typed.trim() !== household.name) {
            setMismatch(true);
            return;
          }
          archive.mutate(
            { householdId: household.id },
            {
              onSuccess: () => {
                toast.success(`${household.name} was archived`);
                void navigate({ to: '/', replace: true });
              },
            },
          );
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor={inputId}>Type {household.name} to confirm</Label>
          <Input
            id={inputId}
            value={typed}
            autoComplete="off"
            className="h-10"
            aria-invalid={mismatch}
            aria-describedby={mismatch ? errorId : undefined}
            onChange={(e) => {
              setTyped(e.target.value);
              setMismatch(false);
            }}
          />
          {mismatch && (
            <p id={errorId} className="text-destructive text-sm">
              The name does not match.
            </p>
          )}
        </div>
      </ConfirmDialog>
    </>
  );
}
