# Deploying on Railway

How production and the demo run, how to set them up once, and how to operate them. The images, the Caddyfile and the smoke stack are described in [architecture.md](architecture.md) section 13; the API settings in section 4 and [data-model.md](data-model.md).

## Contents

1. [Shape](#1-shape)
2. [Decisions](#2-decisions)
3. [One-time setup](#3-one-time-setup)
4. [First-deploy checklist](#4-first-deploy-checklist)
5. [Operating](#5-operating)

## 1. Shape

```
 Cloudflare DNS (splinance.com)
   @     CNAME (flattened) + TXT  -> web
   demo  CNAME + TXT              -> web
   www   proxied, redirect rule   -> https://splinance.com
                |
        Railway edge (TLS, X-Real-IP)
                |
  +-------------v--------------+    project splinance, environment production, EU West
  | web: Caddy + both builds   |    domains splinance.com, demo.splinance.com
  +------+--------------+------+
         | private network (http)
  +------v-----+  +-----v------+
  | api        |  | api-demo   |    one image; pre-deploy: node dist/migrate.mjs
  +------+-----+  +-----+------+
         |              |
  +------v-----+  +-----v--------+
  | postgres   |  | postgres-demo|  postgres-ssl:18, a volume each (Hobby: no Railway backups)
  | no public  |  | TCP proxy    |  only for the data track's read-only login (later)
  +------^-----+  +-----^--------+
         | pg_dump      |
  +------+--------------+------+
  | backup: cron 02:17 UTC     |    age-encrypted dumps -> S3 splinance-backups-bener (Frankfurt)
  +----------------------------+    every run reports to Healthchecks.io
```

Six services. Every merge to `main` deploys the services whose files changed, after CI passed.

## 2. Decisions

| Topic     | Choice                                                                                             | Why                                                                                                                                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Postgres  | Two services, image `ghcr.io/railwayapp-templates/postgres-ssl:18`                                 | The schema needs Postgres 18 (`uuidv7()`); the template's default is older. Public access is per service: the demo's can get a TCP proxy for the data track while production never has a public port        |
| Roles     | Per database an owner (migrations) and an app role (rows only), from `deploy/db/*.sql`             | A compromised API cannot drop or alter tables. The owner has no `CREATEROLE`, so the analytics group role is created by the script                                                                          |
| TLS       | Railway's edge issues certificates; Caddy speaks plain HTTP on `$PORT`                             | One certificate owner, no ACME in the container                                                                                                                                                             |
| Client IP | Edge's `X-Real-IP` -> Caddy -> one `X-Forwarded-For` entry, API `TRUST_PROXY=1`                    | Railway documents `X-Real-IP`, not `X-Forwarded-For`; checked after the first deploy (section 4)                                                                                                            |
| Settings  | Dashboard, written down here                                                                       | Config as Code (`railway.json`) stops being read on 2026-12-01; Infrastructure as Code (`.railway/railway.ts`) needs a Railway token in GitHub: a later step                                                |
| Deploys   | GitHub autodeploy from `main` with "Wait for CI"; migrations as the pre-deploy command             | A commit that failed CI never deploys; a failed migration stops the deploy and the old deployment keeps serving                                                                                             |
| Domains   | Hobby allows two per service: apex and `demo` on `web`; `www` by a Cloudflare redirect rule        | No third service just for a redirect                                                                                                                                                                        |
| Backups   | Our own: a Railway cron service runs `pg_dump` nightly, encrypts with age, uploads to S3 Frankfurt | Railway Hobby cannot create backups at all (manual or scheduled is Pro only). Another provider is offsite by definition; age keeps the private keys out of Railway and AWS; the uploader can only add files |
| Alerting  | Healthchecks.io (free) as a dead man's switch for the backup job                                   | A cron run that never starts produces no Railway event; Healthchecks emails when the success ping does not arrive                                                                                           |

## 3. One-time setup

Needs the Railway CLI (`npm install --global @railway/cli`, then `railway login`) for the database steps; everything else is in the dashboard. Commands run from the repository root, in Git Bash (in PowerShell with script execution disabled, call `railway.cmd` instead of `railway`). Each `railway ssh` asks for the SSH key's passphrase.

Never seal `RAILWAY_DOCKERFILE_PATH`: the builder does not see a sealed value and falls back to Railpack ("No start command detected"). A sealed variable cannot be unsealed; delete it and add it again.

### 3.1 Project and usage limit

1. New project `splinance`, environment `production`, region **EU West (Amsterdam)**.
2. Account -> Usage: a hard limit (about $10), so a runaway service cannot cost more than that.

### 3.2 The two Postgres services

For `postgres` and then `postgres-demo`:

1. New service from the image `ghcr.io/railwayapp-templates/postgres-ssl:18` (check that the tag exists), with a volume mounted where the template mounts it. Name it exactly `postgres` / `postgres-demo` (the variable references below use the names).
2. Settings -> Networking: no public access (for `postgres-demo` too, until the data track needs it).
3. Backups: Railway's are Pro only (manual and scheduled), so Hobby has none; the `backup` service (3.7) covers both databases.
4. Generate the passwords locally, one per role, and keep them in your password manager until they are stored as variables:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

   base64url needs no escaping inside a connection URL.

5. Run the setup script inside the service, as its superuser, over `railway ssh` (no public port needed). bash:

   ```bash
   railway ssh -s postgres -- psql -U postgres -d railway -v ON_ERROR_STOP=1 \
     -v owner_password='<owner>' -v app_password='<app>' -f - < deploy/db/prod.sql

   railway ssh -s postgres-demo -- psql -U postgres -d railway -v ON_ERROR_STOP=1 \
     -v owner_password='<owner>' -v app_password='<app>' -v analytics_password='<analytics>' \
     -f - < deploy/db/demo.sql
   ```

   PowerShell has no `<`: `Get-Content deploy/db/prod.sql -Raw | railway ssh -s postgres -- psql ...`. If piping does not work, `railway ssh -s postgres` opens a shell: start `psql -U postgres -d railway`, set the variables with `\set owner_password '...'` and paste the script.

   The passwords pass through the command line once; clear the shell history line afterwards (PowerShell: `Clear-History`; bash: `history -d`).

### 3.3 The API services

`api` and `api-demo`, both from the GitHub repository, branch `main`:

| Setting                            | `api`                                                                                        | `api-demo` |
| ---------------------------------- | -------------------------------------------------------------------------------------------- | ---------- |
| Variable `RAILWAY_DOCKERFILE_PATH` | `apps/api/Dockerfile`                                                                        | same       |
| Pre-deploy command                 | `node dist/migrate.mjs`                                                                      | same       |
| Healthcheck path                   | `/api/health/ready`                                                                          | same       |
| Watch paths                        | `apps/api/**`, `packages/shared/**`, `pnpm-lock.yaml`, `package.json`, `pnpm-workspace.yaml` | same       |
| Restart policy                     | On failure                                                                                   | same       |
| Wait for CI                        | on                                                                                           | on         |
| Public networking                  | none (only `web` reaches it)                                                                 | none       |

Variables (mark every password and secret as sealed):

| Variable                 | `api`                                                                                  | `api-demo`                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `NODE_ENV`               | `production`                                                                           | `production`                                                                                          |
| `PORT`                   | `3000` (fixed, so `web` knows where to reach it)                                       | `3000`                                                                                                |
| `LOG_LEVEL`              | `info`                                                                                 | `info`                                                                                                |
| `TRUST_PROXY`            | `1`                                                                                    | `1`                                                                                                   |
| `DATABASE_URL`           | `postgresql://splinance_app:<app>@${{postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/splinance` | `postgresql://splinance_demo_app:<app>@${{postgres-demo.RAILWAY_PRIVATE_DOMAIN}}:5432/splinance_demo` |
| `MIGRATE_DATABASE_URL`   | the same with `splinance_owner:<owner>`                                                | the same with `splinance_demo_owner:<owner>`                                                          |
| `JWT_ACCESS_SECRET`      | random, 48 bytes                                                                       | random, different from production (otherwise a demo token would verify on production)                 |
| `REGISTRATION`           | `allowlist`                                                                            | (unset: the demo closes registration itself)                                                          |
| `REGISTRATION_ALLOWLIST` | your email, your partner's                                                             | -                                                                                                     |
| `DEMO_MODE`              | -                                                                                      | `true`                                                                                                |

Production refuses to start with the example JWT secret, `RATE_LIMIT_DISABLED`, or `DEMO_MODE` on a database whose name does not end in `_demo`; registration is closed when `REGISTRATION` is missing.

### 3.4 The web service

From the repository, branch `main`, Wait for CI on:

| Setting                   | Value                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `RAILWAY_DOCKERFILE_PATH` | `deploy/web/Dockerfile`                                                                                     |
| `VITE_DEMO_URL`           | `https://demo.splinance.com` (a build argument: the login page links to it)                                 |
| `DOMAIN`                  | `splinance.com`                                                                                             |
| `API_UPSTREAM`            | `${{api.RAILWAY_PRIVATE_DOMAIN}}:3000`                                                                      |
| `API_DEMO_UPSTREAM`       | `${{api-demo.RAILWAY_PRIVATE_DOMAIN}}:3000`                                                                 |
| Healthcheck path          | `/`                                                                                                         |
| Watch paths               | `apps/web/**`, `packages/shared/**`, `deploy/web/**`, `deploy/scripts/**`, `pnpm-lock.yaml`, `package.json` |

Railway sets `PORT` for this service itself; Caddy listens on it.

### 3.5 Domains

1. `web` -> Settings -> Networking -> Custom domain: `splinance.com`, then `demo.splinance.com`. Railway shows a CNAME target and a TXT record for each; both records are required.
2. Cloudflare (DNS only, grey cloud, first): `CNAME @ <target>` (Cloudflare flattens it at the apex), `CNAME demo <target>`, both TXT records. Optional: `CAA 0 issue "letsencrypt.org"`. If Railway cannot issue a certificate with grey clouds, follow its Cloudflare instructions instead (proxied, SSL mode "Full").
3. `www`: a proxied placeholder record (`A www 192.0.2.1`, orange) and a Cloudflare redirect rule `www.splinance.com/*` -> `https://splinance.com/${1}` (301).
4. The mail records (null MX, SPF `-all`, DMARC `p=reject`) are already in place: nobody can send mail as the domain.

### 3.6 After the first green deploy

1. Showcase household for the data track: `railway ssh -s api-demo -- node dist/demo-create.mjs --seed 42 --days 3650`.
2. Register yourself (an allowlisted email) on production.
3. Run the checklist below.

### 3.7 Backups

Railway Hobby cannot create backups, so the cron service `backup` (`deploy/backup`) dumps both databases every night: `pg_dump --format=custom` and a row count per table from one snapshot, both encrypted with age to the public keys in `deploy/backup/recipients.txt`, uploaded to S3 in Frankfurt (another provider and country, still the EU). Nothing on Railway or AWS can decrypt them: the private keys exist only in your password manager (main) and offline (break-glass). Rows of `sessions` stay out (no refresh-token hashes offsite; everyone logs in again after a restore).

| Prefix in `splinance-backups-bener`     | Kept      |
| --------------------------------------- | --------- |
| `splinance/daily/`                      | 35 days   |
| `splinance/monthly/` (the 1st, UTC)     | 13 months |
| `splinance_demo/daily/` (seeded, cheap) | 14 days   |

Each backup is `<UTC stamp>.dump.age` plus `<UTC stamp>.manifest.txt.age` (size, sha256, versions, row counts); the manifest is uploaded last, so a backup without one is incomplete. The bucket and the IAM user `splinance-backup` come from Terraform (`infra/main/backups.tf`, [data-track.md](data-track.md) section 6): the user can add new files under those prefixes and nothing else (no list, read, overwrite or delete).

1. **age keys** (done 2026-11-04): `age-keygen` twice on your machine (`winget install FiloSottile.age`). The main key's output goes into the password manager, the break-glass key offline; only the two `age1...` public keys go into `recipients.txt`, through a pull request. A private key never goes to Railway, AWS, the repository or a chat.
2. **Backup roles**, one password each (generated as in 3.2). They read everything, including tables later migrations add (`pg_read_all_data`), and write nothing:

   ```bash
   railway ssh -s postgres -- psql -U postgres -d railway -v ON_ERROR_STOP=1 \
     -v db=splinance -v role=splinance_backup -v backup_password='<backup>' -f - < deploy/db/backup.sql

   railway ssh -s postgres-demo -- psql -U postgres -d railway -v ON_ERROR_STOP=1 \
     -v db=splinance_demo -v role=splinance_demo_backup -v backup_password='<backup>' -f - < deploy/db/backup.sql
   ```

3. **AWS access key** for `splinance-backup`, by hand (a key created by Terraform would sit in its state in plain text). Git Bash, after `aws login`; the key goes to the clipboard, not the screen:

   ```bash
   aws iam create-access-key --user-name splinance-backup --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text | clip
   ```

   It prints nothing: the key (id, a tab, the secret) is on the clipboard. Run it once; every run creates another key (at most two per user), and a key whose secret you did not keep has to be deleted (`aws iam list-access-keys`, `delete-access-key`). Paste it into the password manager, then into the variables below, then clear the clipboard. Rotate like Airflow's key: a second key, switch the variables, delete the old one.

4. **Healthchecks.io** (free): a check `splinance-backup` with the cron schedule `17 2 * * *`, time zone UTC, grace time 1 hour, email notifications. Copy its ping URL.
5. **The `backup` service**, from the repository, branch `main`:

   | Setting                   | Value                                 |
   | ------------------------- | ------------------------------------- |
   | `RAILWAY_DOCKERFILE_PATH` | `deploy/backup/Dockerfile`            |
   | Cron schedule             | `17 2 * * *` (UTC)                    |
   | Restart policy            | Never (Healthchecks reports failures) |
   | Watch paths               | `deploy/backup/**`, `deploy/db/**`    |
   | Wait for CI               | on                                    |
   | Public networking         | none                                  |

   Variables, all sealed except the bucket (and `RAILWAY_DOCKERFILE_PATH`, never sealed):

   | Variable                                     | Value                                                                                                                       |
   | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
   | `PROD_DATABASE_URL`                          | `postgresql://splinance_backup:<backup>@${{postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/splinance?sslmode=require`                |
   | `DEMO_DATABASE_URL`                          | `postgresql://splinance_demo_backup:<backup>@${{postgres-demo.RAILWAY_PRIVATE_DOMAIN}}:5432/splinance_demo?sslmode=require` |
   | `BACKUP_BUCKET`                              | `splinance-backups-bener`                                                                                                   |
   | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | from step 3                                                                                                                 |
   | `HC_PING_URL`                                | from step 4 (whoever has it can report a fake success)                                                                      |

6. **First run** by hand (`railway cron run`, or from the service in the dashboard; deploying a cron service does not run it): the log ends with `all backups uploaded`, Healthchecks shows a green run, and `aws s3 ls s3://splinance-backups-bener --recursive` lists four new files. Then the restore drill (section 5).

Set up and drilled on 2026-11-04 (drill log in section 5): since then production may hold real data.

## 4. First-deploy checklist

1. **Headers:** `curl -I https://splinance.com/login` shows HSTS, CSP (`script-src 'self' 'sha256-...'`), `nosniff`, `Referrer-Policy: no-referrer`, no `Server` from Caddy (`Server: railway-hikari` is added by Railway's edge and cannot be removed); `curl -I https://splinance.com/api/health/ready` shows Helmet's headers. Same for the demo.
2. **Client IP:** the API log line of your request shows your IP, not Railway's. Send `curl -H "X-Real-IP: 203.0.113.9" -H "X-Forwarded-For: 203.0.113.9" https://splinance.com/api/health/live`: the log must still show your real IP. If it shows the forged one, fix that before relying on rate limits.
3. **Cookies:** after login the refresh cookie is `Secure; HttpOnly; SameSite=Strict; Path=/api/auth`, without `Domain` (host-only), on both hosts.
4. **Registration:** a non-allowlisted email gets "Sign-ups are invite-only for now".
5. **Demo:** "Try the demo" works; `https://splinance.com/api/demo` is 404; the `api-demo` log shows the hourly cleanup.
6. **Pre-deploy gate:** a deploy whose migration fails stops before going live (read one deploy log, or try it on a throwaway branch environment).
7. **Restore drill:** both databases from S3 with `restore.sh`, and the Railway path once (section 5); results into the drill log. Until it has passed, production holds no real data. (Passed 2026-11-04.)
8. **Networking:** `postgres` has no public URL; `railway connect postgres` works anyway (it tunnels over SSH).

## 5. Operating

- **Deploying:** merge to `main`. CI runs; with Wait for CI the services whose watch paths changed build and deploy afterwards, each API after its migrations.
- **Migrations are forward-only and must work with the previous image** (expand, then contract in a later release). Rolling back is then the previous deployment (dashboard: Deployments -> an earlier one -> Redeploy); the database goes back only from a backup, if a migration destroyed data.
- **Logs:** `railway logs -s api` (pino JSON). Requests are logged with redacted URLs, never tokens.
- **Before touching the images, the Caddyfile or `deploy/db`:** run the smoke stack locally (the CI job `Images and smoke` does the same):

  ```bash
  docker build -f apps/api/Dockerfile -t splinance-api:smoke .
  docker build -f deploy/web/Dockerfile -t splinance-web:smoke --build-arg VITE_DEMO_URL=http://demo.localhost:8080 .
  docker compose -f deploy/compose.smoke.yml up -d
  pnpm --filter @splinance/e2e e2e:smoke
  docker compose -f deploy/compose.smoke.yml down -v
  ```

  It runs on the production roles from `deploy/db` (migrations as the owner, the API as the app role) on one Postgres server. CI then also runs the backup job against both smoke databases (as the backup roles, files instead of S3, a throwaway age key) and restores them into a scratch server: every row count must match.

- **Backups** (3.7): nightly at 02:17 UTC; `railway logs -s backup`. A failed, hung or missing run emails you from Healthchecks.io. A Postgres major upgrade on Railway needs the backup image's `postgres:` tag bumped first (pg_dump refuses a newer server).
- **Restore drill:** before real data goes into production, then quarterly, after changes to `deploy/backup` or `deploy/db`, and after a Postgres upgrade. On your machine, with Docker (bash):

  ```bash
  aws login
  eval "$(aws configure export-credentials --format env)"
  docker compose -f deploy/backup/compose.drill.yml up -d --wait scratch
  docker compose -f deploy/backup/compose.drill.yml run --rm restore restore.sh --db splinance
  docker compose -f deploy/backup/compose.drill.yml run --rm restore restore.sh --db splinance_demo
  docker compose -f deploy/backup/compose.drill.yml down -v
  ```

  The first `run` builds the image. `restore.sh` takes the newest daily backup (`--stamp <UTC stamp>` or `--tier monthly` for others), asks for the age identity (paste the `AGE-SECRET-KEY-1...` line; not echoed, kept in the container's tmpfs), checks the dump's sha256, sets up the scratch server with `deploy/db` (throwaway passwords), restores as the owner in one transaction, compares every row count with the manifest, checks that the app role can read but not change the schema, and prints the timings. The scratch server keeps nothing (tmpfs). It refuses a server that already has the database, so it cannot overwrite production. With real data in the backups, run it only on a machine you trust.

- **Disaster restore (the Railway path):** a new `postgres` service as in 3.2 (prod.sql and backup.sql with the passwords from the password manager), then from your machine, with the identity in a temporary file you delete afterwards:

  ```bash
  aws s3 cp s3://splinance-backups-bener/splinance/daily/<stamp>.dump.age .
  age -d -i <identity-file> <stamp>.dump.age | railway ssh -s postgres -- \
    pg_restore -U splinance_owner -d splinance --no-owner --exit-on-error --single-transaction
  ```

  Then redeploy `api` (its pre-deploy migration finds nothing to do). Up to a day of data is lost (RPO 24 h).

  The binary pipe through `railway ssh` was drilled on 2026-11-04 with a demo dump into a scratch database on `postgres-demo` (the real one untouched). To repeat it (bash, age not on `PATH` after winget until a new terminal):

  ```bash
  S=splinance_demo/daily/<stamp>; D="$TEMP/drill"; mkdir -p "$D"
  aws s3 cp --only-show-errors "s3://splinance-backups-bener/$S.dump.age" "$D/dump.age"
  aws s3 cp --only-show-errors "s3://splinance-backups-bener/$S.manifest.txt.age" "$D/manifest.age"
  read -rsp 'age identity: ' id; echo; (umask 077; printf '%s\n' "$id" > "$D/key"); unset id
  railway ssh -s postgres-demo -- dropdb -U postgres --if-exists drill
  railway ssh -s postgres-demo -- createdb -U postgres drill
  age -d -i "$D/key" "$D/dump.age" | railway ssh -s postgres-demo -- \
    pg_restore -U postgres -d drill --no-owner --no-acl --exit-on-error --single-transaction
  age -d -i "$D/key" "$D/manifest.age" | grep -E '^table public\.(users|transactions) '
  railway ssh -s postgres-demo -- psql -U postgres -d drill -XAt \
    -c "select 'users', count(*) from users union all select 'transactions', count(*) from transactions"
  railway ssh -s postgres-demo -- dropdb -U postgres drill
  rm -rf "$D"
  ```

- **Backup keys:** the AWS key rotates like Airflow's (3.7 step 3); a backup role password like the other roles (below). A new age key goes into `recipients.txt` through a pull request; keep the old private key until the last backup encrypted to it has expired (13 months).
- **Restore drill log:**

  | Date       | Database                            | Backup                   | Encrypted size | Restore                             | Total           | Result                                                                         |
  | ---------- | ----------------------------------- | ------------------------ | -------------- | ----------------------------------- | --------------- | ------------------------------------------------------------------------------ |
  | 2026-11-04 | `splinance`                         | `20261104T114309Z` daily | 66,119 B       | 0 s                                 | 2 s (fetch 2 s) | PASSED, 14 of 14 tables match, app role ok                                     |
  | 2026-11-04 | `splinance_demo`                    | `20261104T114309Z` daily | 106,159 B      | 0 s                                 | 2 s (fetch 2 s) | PASSED, 14 of 14 tables match, app role ok                                     |
  | 2026-11-04 | `splinance_demo` over `railway ssh` | `20261104T114309Z` daily | 106,159 B      | under 11 s, SSH passphrase included | -               | PASSED, users 2, households 1, transactions 247, splits 314 as in the manifest |

- **Secrets:** rotating `JWT_ACCESS_SECRET` signs everyone out within 15 minutes (access tokens), refresh cookies keep working. Role passwords: `ALTER ROLE ... PASSWORD` over `railway ssh`, then the variable, then redeploy.
- **Data track:** when the pipeline reads the deployed demo (D5 switch), enable the TCP proxy on `postgres-demo` only, connect as `splinance_demo_analytics` with `sslmode=verify-ca` and the server's certificate pinned (the image's certificate is self-signed); see [data-track.md](data-track.md).
