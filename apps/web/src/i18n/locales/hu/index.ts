import type { Catalog } from '../../types';
import { account } from './account';
import { auth } from './auth';
import { common } from './common';
import { errors } from './errors';
import { shell } from './shell';

/** Hungarian, informal ("te"), like most Hungarian consumer apps. Glossary: README.md. */
export const hu: Catalog = { common, auth, account, errors, shell };
