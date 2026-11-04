import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PROVIDER_VIEWS, providerStartHref } from '../providers';
import { useSignInProviders } from '../use-sign-in-providers';

/**
 * "Continue with Google" above the email form, then an "or with email" divider. Renders
 * nothing when no provider is configured (or the list failed to load): the password form
 * works on its own. Plain links, styled as buttons: the start is a full-page navigation to
 * the API, which redirects to the provider.
 */
export function ProviderButtons({ redirect }: { redirect: string | undefined }) {
  const providers = useSignInProviders();
  if (providers.length === 0) return null;

  return (
    <div className="mb-6 space-y-6">
      <div className="space-y-2">
        {providers.map(({ id }) => {
          const view = PROVIDER_VIEWS[id];
          if (!view) return null;
          return (
            <a
              key={id}
              href={providerStartHref(id, redirect)}
              className={cn(
                buttonVariants({ variant: 'outline', size: 'lg' }),
                'h-10 w-full gap-2.5',
              )}
            >
              <view.Logo className="size-4" />
              Continue with {view.name}
            </a>
          );
        })}
      </div>
      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        <span className="bg-border h-px flex-1" aria-hidden />
        or with email
        <span className="bg-border h-px flex-1" aria-hidden />
      </div>
    </div>
  );
}
