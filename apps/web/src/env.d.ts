/// <reference types="vite/client" />

/**
 * True in the demo site's build (`VITE_DEMO=true`, see `define` in vite.config.ts): its home
 * page is the landing page with "Try the demo", household pages show the demo banner, and
 * "Log out" becomes "End demo". A literal in builds, so production bundles drop all of it.
 * Tests switch it with `setDemoSite()` (test/demo-site.ts), hence `var`: a property of
 * globalThis they can assign.
 */
// eslint-disable-next-line no-var
declare var __DEMO_SITE__: boolean;

interface ImportMetaEnv {
  /** Production only: the demo site's address, linked from the login page. */
  readonly VITE_DEMO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
