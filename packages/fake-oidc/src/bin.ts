import { startFakeOidc } from './index.ts';

/**
 * The fake provider as its own process, for the e2e suite (a Playwright webServer):
 * `node src/bin.ts` (Node runs the TypeScript directly). Nobody is queued, so its
 * authorization endpoint shows the "Sign in as" form that tests fill in.
 */
const fake = await startFakeOidc({
  port: Number(process.env.PORT ?? 3300),
  clientId: process.env.FAKE_OIDC_CLIENT_ID ?? 'e2e-client',
  clientSecret: process.env.FAKE_OIDC_CLIENT_SECRET ?? 'e2e-secret',
  issuerHost: process.env.FAKE_OIDC_ISSUER_HOST ?? '127.0.0.1',
});
console.log(`Fake OpenID provider at ${fake.issuer}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void fake.close().then(() => process.exit(0));
  });
}
