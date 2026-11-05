import type { HouseholdDetail } from '@splinance/shared';
import { useNavigate } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { i18n } from '@/i18n';
import { errorMessage } from '@/lib/query-client';
import { useArchiveHousehold, useLeaveHousehold } from '../hooks';

export function DangerZone({ household }: { household: HouseholdDetail }) {
  const { t } = useTranslation('households');
  const isOwner = household.role === 'owner';

  return (
    <Card className="ring-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive">{t('danger.title')}</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        <DangerRow title={t('danger.leaveTitle')} description={t('danger.leaveDescription')}>
          <LeaveButton household={household} />
        </DangerRow>
        {isOwner && (
          <DangerRow title={t('danger.archiveTitle')} description={t('danger.archiveDescription')}>
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
  const { t } = useTranslation('households');
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
        {t('danger.leave')}
      </Button>
      {isLastOwner ? (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title={t('danger.onlyOwnerTitle')}
          description={t('danger.onlyOwnerDescription')}
        />
      ) : (
        <ConfirmDialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) leave.reset();
          }}
          title={t('danger.leaveConfirmTitle', { household: household.name })}
          description={t('danger.leaveDescription')}
          confirmLabel={t('danger.leave')}
          pendingLabel={t('danger.leaving')}
          destructive
          pending={leave.isPending}
          error={
            leave.error
              ? errorMessage(leave.error, { UNSETTLED_BALANCE: i18n.t('errors:unsettled.leave') })
              : undefined
          }
          onConfirm={() => {
            leave.mutate(
              { householdId: household.id },
              {
                onSuccess: () => {
                  toast.success(t('danger.left', { household: household.name }));
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
  const { t } = useTranslation('households');
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
        {t('danger.archive')}
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
        title={t('danger.archiveConfirmTitle', { household: household.name })}
        description={t('danger.archiveConfirmDescription')}
        confirmLabel={t('danger.archive')}
        pendingLabel={t('danger.archiving')}
        destructive
        pending={archive.isPending}
        error={
          archive.error
            ? errorMessage(archive.error, { UNSETTLED_BALANCE: i18n.t('errors:unsettled.archive') })
            : undefined
        }
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
                toast.success(t('danger.archived', { household: household.name }));
                void navigate({ to: '/', replace: true });
              },
            },
          );
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor={inputId}>{t('danger.typeName', { household: household.name })}</Label>
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
              {t('danger.nameMismatch')}
            </p>
          )}
        </div>
      </ConfirmDialog>
    </>
  );
}
