import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/http';
import { errorMessage } from '@/lib/query-client';
import { useDisconnect, useStartConnect } from '../hooks';
import { CurrentPasswordField } from './current-password-field';

/** A wrong current password goes next to the field; anything else above it. */
function splitError(error: Error | null) {
  if (!error) return { field: undefined, form: undefined };
  return error instanceof ApiError && error.code === 'WRONG_PASSWORD'
    ? { field: error.message, form: undefined }
    : { field: undefined, form: errorMessage(error) };
}

/**
 * Connect: confirm with the current password (if the account has one), then leave for the
 * provider; it comes back to /account?connected=<id>.
 */
export function ConnectButton({
  provider,
  name,
  hasPassword,
}: {
  provider: string;
  name: string;
  hasPassword: boolean;
}) {
  const connect = useStartConnect();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const errors = splitError(connect.error);
  // Navigating away takes a moment after the request succeeded.
  const leaving = connect.isPending || connect.isSuccess;

  const start = () => {
    connect.mutate({ provider, currentPassword: hasPassword ? password : undefined });
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        Connect
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setPassword('');
            connect.reset();
          }
        }}
        title={`Connect ${name}?`}
        description={
          hasPassword
            ? `Confirm it's you, then pick your account at ${name}. After that you can sign in with either.`
            : `Pick your account at ${name}. After that you can sign in with it too.`
        }
        confirmLabel={`Continue to ${name}`}
        pendingLabel="Opening…"
        pending={leaving}
        error={errors.form}
        onConfirm={start}
      >
        {hasPassword && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              start();
            }}
          >
            <CurrentPasswordField
              value={password}
              onChange={(value) => {
                setPassword(value);
                connect.reset();
              }}
              error={errors.field}
            />
          </form>
        )}
      </ConfirmDialog>
    </>
  );
}

/** Disconnect: confirm (with the password if there is one); other devices are signed out. */
export function DisconnectButton({
  provider,
  name,
  hasPassword,
}: {
  provider: string;
  name: string;
  hasPassword: boolean;
}) {
  const disconnect = useDisconnect();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const errors = splitError(disconnect.error);

  const confirm = () => {
    disconnect.mutate(
      { provider, currentPassword: hasPassword ? password : undefined },
      {
        onSuccess: () => {
          setOpen(false);
          setPassword('');
          toast.success(`${name} is disconnected. Other devices are signed out.`);
        },
      },
    );
  };

  return (
    <>
      <Button
        variant="outline"
        className="text-destructive hover:text-destructive"
        onClick={() => {
          setOpen(true);
        }}
      >
        Disconnect
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setPassword('');
            disconnect.reset();
          }
        }}
        title={`Disconnect ${name}?`}
        description={`You won't be able to sign in with ${name} any more. Other devices are signed out; you stay signed in here.`}
        confirmLabel="Disconnect"
        pendingLabel="Disconnecting…"
        destructive
        pending={disconnect.isPending}
        error={errors.form}
        onConfirm={confirm}
      >
        {hasPassword && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              confirm();
            }}
          >
            <CurrentPasswordField
              value={password}
              onChange={(value) => {
                setPassword(value);
                disconnect.reset();
              }}
              error={errors.field}
            />
          </form>
        )}
      </ConfirmDialog>
    </>
  );
}
