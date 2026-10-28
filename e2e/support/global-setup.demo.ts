import { E2E_DEMO_DATABASE_URL } from './env';
import { prepareDatabase } from './global-setup';

export default async function globalSetup() {
  await prepareDatabase(E2E_DEMO_DATABASE_URL);
}
