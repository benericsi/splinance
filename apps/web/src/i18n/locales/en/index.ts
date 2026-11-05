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

/** English, the source language: every other catalog has exactly these keys. */
export const en = {
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
