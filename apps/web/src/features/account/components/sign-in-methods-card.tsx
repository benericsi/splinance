import type { AccountResponse } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { Info, KeyRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PROVIDER_VIEWS } from '@/features/auth/providers';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import { cn } from '@/lib/utils';
import { formatDate, formatLastUsed } from '../format';
import { ConnectButton, DisconnectButton } from './provider-actions';

/**
 * Every way into the account: the password and each provider this instance offers or the
 * user has connected. Providers the web has no view for are left out (as on /login). The
 * last way in has no Disconnect button, only the explanation (the API refuses it too).
 */
export function SignInMethodsCard({ account }: { account: AccountResponse }) {
  const providerIds = [
    ...new Set([
      ...account.identities.map((i) => i.provider),
      ...account.providers.map((p) => p.id),
    ]),
  ];
  const offered = new Set(account.providers.map((p) => p.id));
  const waysIn = account.identities.length + (account.hasPassword ? 1 : 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-in methods</CardTitle>
        <CardDescription>How you get into Splinance. Keep at least one.</CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        <MethodRow
          icon={<KeyRound className="size-4" aria-hidden />}
          name="Password"
          status={account.hasPassword ? 'Set' : 'Not set'}
          action={
            __DEMO_SITE__ ? undefined : (
              <Link
                to="/account/password"
                state={OPEN_MODAL_STATE}
                // cn merges the variant's border over the base's transparent one.
                className={cn(buttonVariants({ variant: 'outline' }))}
              >
                {account.hasPassword ? 'Change' : 'Set a password'}
              </Link>
            )
          }
        />
        {providerIds.map((id) => {
          const view = PROVIDER_VIEWS[id];
          if (!view) return null;
          const identity = account.identities.find((i) => i.provider === id);
          const onlyWayIn = identity !== undefined && waysIn === 1;
          return (
            <MethodRow
              key={id}
              icon={<view.Logo className="size-4" />}
              name={view.name}
              status={
                identity
                  ? `Connected ${formatDate(identity.connectedAt)} · Last used ${formatLastUsed(identity.lastUsedAt)}`
                  : 'Not connected'
              }
              action={
                onlyWayIn ? undefined : identity ? (
                  <DisconnectButton
                    provider={id}
                    name={view.name}
                    hasPassword={account.hasPassword}
                  />
                ) : offered.has(id) ? (
                  <ConnectButton provider={id} name={view.name} hasPassword={account.hasPassword} />
                ) : undefined
              }
              note={
                onlyWayIn
                  ? `Your only way to sign in. Set a password first, then you can disconnect ${view.name}.`
                  : undefined
              }
            />
          );
        })}
      </CardContent>
    </Card>
  );
}

function MethodRow({
  icon,
  name,
  status,
  action,
  note,
}: {
  icon: ReactNode;
  name: string;
  status: string;
  action?: ReactNode;
  note?: string | undefined;
}) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{name}</p>
          <p className="text-muted-foreground text-sm">{status}</p>
        </div>
        {action}
      </div>
      {note && (
        <p className="bg-muted text-muted-foreground mt-3 flex gap-2 rounded-lg px-3 py-2 text-sm sm:ml-12">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {note}
        </p>
      )}
    </div>
  );
}
