import type { Catalog } from '../../types';
import { account } from './account';
import { auth } from './auth';
import { categories } from './categories';
import { common } from './common';
import { errors } from './errors';
import { households } from './households';
import { invites } from './invites';
import { onboarding } from './onboarding';
import { privacy } from './privacy';
import { rules } from './rules';
import { shell } from './shell';

/** Hungarian, informal ("te"), like most Hungarian consumer apps. Glossary: README.md. */
export const hu: Catalog = {
  common,
  auth,
  account,
  errors,
  shell,
  households,
  invites,
  onboarding,
  categories,
  rules,
  privacy,
};
