import { PROVIDER_VIEWS } from '../providers';

/**
 * Shown on /login?oauth=link: the provider account belongs to an email that already has a
 * password account, which connects it only after its password (account takeover guard).
 */
export function LinkNotice({ providerId }: { providerId: string }) {
  const view = PROVIDER_VIEWS[providerId];
  const name = view?.name ?? providerId;
  return (
    <div
      role="status"
      className="bg-muted/50 mb-6 flex items-start gap-3 rounded-md border px-3 py-2.5 text-sm"
    >
      {view && <view.Logo className="mt-0.5 size-4 shrink-0" />}
      <div className="space-y-0.5">
        <p className="font-medium">Connect your {name} account</p>
        <p className="text-muted-foreground">
          This email already has a Splinance account. Log in with its password once to connect{' '}
          {name}.
        </p>
      </div>
    </div>
  );
}
