# Data model

Living document: it describes the tables that exist today plus the conventions every new table follows. Tables are added only when a feature needs them.

## Conventions

| Topic               | Rule                                                                                                                     | Why                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Primary keys        | `uuid DEFAULT uuidv7()` (Postgres 18)                                                                                    | Time-ordered for index locality, not enumerable like `serial`. A v7 id reveals its creation time, which is harmless here |
| Timestamps          | `timestamptz`, UTC, `created_at` / `updated_at`                                                                          | No time zone ambiguity                                                                                                   |
| Calendar dates      | `date` for "when it happened" (e.g. transaction date)                                                                    | Bank statements give dates; a timestamp would shift them across midnight                                                 |
| Money               | `bigint` minor units + `currency`; never floats                                                                          | Exact arithmetic. Exponent per currency: HUF 0, EUR 2 (HUF has no fillér in practice)                                    |
| Enums               | Postgres enums generated from shared `as const` string arrays                                                            | One source of truth for DB, Zod and UI labels                                                                            |
| Deleting            | `deleted_at` / `archived_at` on user-facing records; users with history are never hard-deleted                           | Balances and the audit trail must stay correct                                                                           |
| Household isolation | Household-scoped tables carry `household_id`; references to members and categories use composite FKs `(household_id, x)` | The database rejects cross-household references even if service code has a bug                                           |
| Constraint names    | Named explicitly (`users_email_unique`)                                                                                  | Stable names for error handling and migrations                                                                           |
| Naming              | snake_case columns, plural table names (Drizzle `casing: 'snake_case'`)                                                  |                                                                                                                          |

## Tables

### `users`

| Column                 | Type                                | Notes                                                                                    |
| ---------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------- |
| id                     | uuid PK                             | uuidv7                                                                                   |
| email                  | text, unique (`users_email_unique`) | Lowercased by the shared `emailSchema`; `CHECK (email = lower(email))`                   |
| password_hash          | text                                | Argon2id (`@node-rs/argon2`, m=19456 KiB, t=2, p=1), PHC string with salt and parameters |
| display_name           | text                                | 1-50 characters (CHECK)                                                                  |
| created_at, updated_at | timestamptz                         |                                                                                          |

Deliberately not stored: first/last name, phone number. No feature needs them yet (data minimization, GDPR). Add them with the feature that does.

### `sessions`

One row per login (device). The refresh token rotates in place.

| Column              | Type                                  | Notes                                    |
| ------------------- | ------------------------------------- | ---------------------------------------- |
| id                  | uuid PK                               | Also the `sid` claim of access tokens    |
| user_id             | uuid FK -> users, `ON DELETE CASCADE` | indexed                                  |
| token_hash          | text, unique                          | SHA-256 of the current refresh token     |
| previous_token_hash | text, nullable                        | The token it replaced; indexed           |
| rotated_at          | timestamptz                           | Last rotation, used for the grace window |
| expires_at          | timestamptz                           | Sliding: 30 days from the last rotation  |
| revoked_at          | timestamptz, nullable                 | Logout or reuse detection                |
| created_at          | timestamptz                           |                                          |

Refresh handling:

| Incoming token matches                             | Result                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `token_hash`, session active                       | Rotate: new token, old hash moves to `previous_token_hash`                                          |
| `previous_token_hash`, within 10 s of `rotated_at` | 200 with a new access token, no new cookie (another tab already rotated; tabs share the cookie jar) |
| `previous_token_hash`, after the grace window      | Reuse: session revoked, 401                                                                         |
| nothing                                            | 401                                                                                                 |

Rows are locked with `SELECT ... FOR UPDATE`, so truly concurrent refreshes produce exactly one rotation. A token stolen two or more rotations ago is rejected but does not trigger a revoke (accepted tradeoff for a single table).

Access tokens are stateless JWTs (HS256, 15 minutes). A revoked session's access token stays valid until it expires.

## Planned (not created yet)

- Phase 1: `households`, `household_members` (role owner/member, `left_at` instead of deleting), `household_invites` (single use, 7 days, owners only, token stored hashed)
- Phase 2: `categories` (lucide icon name, color, expense/income), `transactions` (shared/private, expense/income, `occurred_on date`, `version` for optimistic locking), `transaction_splits` (shares always sum to the amount), `settlements`, `audit_log`
- Later: imports (staging rows, duplicates flagged not rejected), category rules (no user regex), budgets (month as `date`), recurring series, notifications

Business rules already agreed:

- Private transactions are paid by their author and never split; anything involving another person is shared.
- A member cannot leave a household with an unsettled balance; an owner can record a settlement for any pair (audited).
