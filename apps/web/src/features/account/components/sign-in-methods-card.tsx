import type { AccountResponse } from '@splinance/shared';
import { Link } from '@tanstack/react-router';
import { KeyRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PROVIDER_VIEWS } from '@/features/auth/providers';
import { OPEN_MODAL_STATE } from '@/lib/route-modal';
import { cn } from '@/lib/utils';
import { formatDate, formatLastUsed } from '../format';

/**
 * Every way into the account: the password and each provider this instance offers or the
 * user has connected. Providers the web has no view for are left out (as on /login).
 */
export function SignInMethodsCard({ account }: { account: AccountResponse }) {
  const providerIds = [
    ...new Set([
      ...account.identities.map((i) => i.provider),
      ...account.providers.map((p) => p.id),
    ]),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-in methods</CardTitle>
        <CardDescription>How you get into Splinance.</CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        <MethodRow
          icon={<KeyRound className="size-4" aria-hidden />}
          name="Password"
          status={account.hasPassword ? 'Set' : 'Not set'}
          action={
            account.hasPassword && !__DEMO_SITE__ ? (
              <Link
                to="/account/password"
                state={OPEN_MODAL_STATE}
                // cn merges the variant's border over the base's transparent one.
                className={cn(buttonVariants({ variant: 'outline' }))}
              >
                Change
              </Link>
            ) : undefined
          }
        />
        {providerIds.map((id) => {
          const view = PROVIDER_VIEWS[id];
          if (!view) return null;
          const identity = account.identities.find((i) => i.provider === id);
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
}: {
  icon: ReactNode;
  name: string;
  status: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{name}</p>
        <p className="text-muted-foreground text-sm">{status}</p>
      </div>
      {action}
    </div>
  );
}
