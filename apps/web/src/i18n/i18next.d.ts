import 'i18next';
import type { en } from './locales/en';

// Typed keys: t('account:profile.title') fails typecheck when the key does not exist.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: typeof en;
  }
}
