import { useQuery } from '@tanstack/react-query';
import { PROVIDER_VIEWS } from './providers';
import { authQueries } from './queries';

/** The providers this instance offers that the web knows how to show (none on error). */
export function useSignInProviders() {
  const { data = [] } = useQuery(authQueries.providers());
  return data.filter((provider) => PROVIDER_VIEWS[provider.id]);
}
