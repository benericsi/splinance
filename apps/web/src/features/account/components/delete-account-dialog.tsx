import { type AccountDeletionPreview, type AccountResponse, msg } from '@splinance/shared';
import { revalidateLogic, useForm } from '@tanstack/react-form';
import { Link } from '@tanstack/react-router';
import { Archive, Crown, DoorOpen, HardDrive, Lock, Scale, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { z } from 'zod';
import { FormError } from '@/components/form/form-error';
import { TextField } from '@/components/form/text-field';
import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/http';
import { errorMessage } from '@/lib/query-client';
import { useDeleteAccount } from '../hooks';
import { ReauthPrompt } from './password-dialog';

/**
 * Deleting the account: first what would happen (the API's preview), then step-up and the
 * email typed again. With a blocker (an open balance, the only owner) there is no form,
 * only the way to resolve it. Never deletes on load.
 */
export function DeleteAccountDialog({
  account,
  preview,
  onClose,
}: {
  account: AccountResponse;
  preview: AccountDeletionPreview;
  onClose: () => void;
}) {
  const blocked = preview.blockers.length > 0;
  const needsReauth = !account.hasPassword && !account.recentSignIn;
  const { t } = useTranslation(['account', 'common', 'auth']);

  return (
    <RouteDialog
      title={t('delete.title')}
      description={blocked ? t('delete.blocked') : t('delete.final')}
      onClose={onClose}
    >
      {blocked ? (
        <Blockers preview={preview} />
      ) : (
        <div className="space-y-5">
          <Consequences preview={preview} />
          {needsReauth ? (
            <ReauthPrompt account={account} redirect="/account/delete" />
          ) : (
            <ConfirmForm account={account} />
          )}
        </div>
      )}
    </RouteDialog>
  );
}

function Item({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm">
      <span className="text-muted-foreground mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

function Blockers({ preview }: { preview: AccountDeletionPreview }) {
  const { t } = useTranslation(['account', 'common', 'auth']);
  return (
    <ul className="border-destructive/30 bg-destructive/5 space-y-3 rounded-lg border p-3">
      {preview.blockers.map(({ householdId, householdName, code }) => (
        <Item
          key={`${householdId}-${code}`}
          icon={code === 'UNSETTLED_BALANCE' ? <Scale aria-hidden /> : <Crown aria-hidden />}
        >
          {code === 'UNSETTLED_BALANCE' ? (
            <Trans
              t={t}
              i18nKey="delete.openBalance"
              values={{ household: householdName }}
              components={{
                strong: <span className="font-medium" />,
                a: (
                  <Link
                    to="/h/$householdId"
                    params={{ householdId }}
                    className="text-link underline underline-offset-4"
                  />
                ),
              }}
            />
          ) : (
            <Trans
              t={t}
              i18nKey="delete.onlyOwner"
              values={{ household: householdName }}
              components={{
                strong: <span className="font-medium" />,
                a: (
                  <Link
                    to="/h/$householdId/settings"
                    params={{ householdId }}
                    className="text-link underline underline-offset-4"
                  />
                ),
              }}
            />
          )}
        </Item>
      ))}
    </ul>
  );
}

function Consequences({ preview }: { preview: AccountDeletionPreview }) {
  const { t } = useTranslation(['account', 'common', 'auth']);
  const count = preview.privateTransactionCount;
  const strong = { strong: <span className="font-medium" /> };
  return (
    <ul className="space-y-2.5">
      {preview.leaves.map((h) => (
        <Item key={h.householdId} icon={<DoorOpen aria-hidden />}>
          <Trans
            t={t}
            i18nKey="delete.leaves"
            values={{ household: h.householdName }}
            components={strong}
          />
        </Item>
      ))}
      {preview.deletes.map((h) => (
        <Item key={h.householdId} icon={<Trash2 aria-hidden />}>
          <Trans
            t={t}
            i18nKey="delete.deletes"
            values={{ household: h.householdName }}
            components={strong}
          />
        </Item>
      ))}
      {preview.archives.map((h) => (
        <Item key={h.householdId} icon={<Archive aria-hidden />}>
          <Trans
            t={t}
            i18nKey="delete.archives"
            values={{ household: h.householdName }}
            components={strong}
          />
        </Item>
      ))}
      {count > 0 && <Item icon={<Lock aria-hidden />}>{t('delete.private', { count })}</Item>}
      <Item icon={<HardDrive aria-hidden />}>{t('delete.backups')}</Item>
    </ul>
  );
}

// API errors that belong to one field, shown next to it.
const FIELD_ERRORS: Partial<Record<string, 'currentPassword' | 'confirmEmail'>> = {
  WRONG_PASSWORD: 'currentPassword',
  CONFIRMATION_MISMATCH: 'confirmEmail',
};

function ConfirmForm({ account }: { account: AccountResponse }) {
  const { t } = useTranslation(['account', 'common', 'auth']);
  const remove = useDeleteAccount();
  const { user, hasPassword } = account;
  const schema = z.object({
    currentPassword: hasPassword
      ? z.string().min(1, msg('currentPassword.required')).max(128)
      : z.string(),
    confirmEmail: z
      .string()
      .trim()
      .toLowerCase()
      .refine((value) => value === user.email, t('delete.emailMismatch')),
  });

  const form = useForm({
    defaultValues: { currentPassword: '', confirmEmail: '' },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: schema },
    onSubmit: async ({ value }) => {
      const { currentPassword, confirmEmail } = schema.parse(value);
      try {
        await remove.mutateAsync(
          hasPassword ? { currentPassword, confirmEmail } : { confirmEmail },
        );
        // The session ends as `deleted`: the guards take the browser to /login.
      } catch {
        // Rendered from remove.error below.
      }
    },
  });

  const code = remove.error instanceof ApiError ? remove.error.code : undefined;
  const field = FIELD_ERRORS[code ?? ''];
  const serverError = field && remove.error ? errorMessage(remove.error) : undefined;
  const formError = remove.error && !field ? errorMessage(remove.error) : undefined;

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <FormError message={formError} />
      {hasPassword && (
        <form.Field name="currentPassword">
          {(f) => (
            <TextField
              field={f}
              required
              label={t('common:password.current')}
              type="password"
              placeholder={t('common:password.currentPlaceholder')}
              autoComplete="current-password"
              maxLength={128}
              serverError={field === 'currentPassword' ? serverError : undefined}
              onValueChange={remove.reset}
            />
          )}
        </form.Field>
      )}
      <form.Field name="confirmEmail">
        {(f) => (
          <TextField
            field={f}
            required
            label={t('delete.typeEmail', { email: user.email })}
            placeholder={user.email}
            autoComplete="off"
            maxLength={254}
            serverError={field === 'confirmEmail' ? serverError : undefined}
            onValueChange={remove.reset}
          />
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <div className="flex justify-end pt-1">
            <Button type="submit" variant="destructive" size="lg" disabled={isSubmitting}>
              {isSubmitting ? t('delete.submitting') : t('delete.submit')}
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}
