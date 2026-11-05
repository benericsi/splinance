import { account } from './account';
import { auth } from './auth';
import { common } from './common';
import { errors } from './errors';
import { shell } from './shell';

/** English, the source language: every other catalog has exactly these keys. */
export const en = { common, auth, account, errors, shell };
