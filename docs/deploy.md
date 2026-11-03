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
  | postgres   |  | postgres-demo|  postgres-ssl:18, a volume and backups each
  | no public  |  | TCP proxy    |  only for the data track's read-only login (later)
  +------------+  +--------------+
```

Five services. Every merge to `main` deploys the services whose files changed, after CI passed.

## 2. Decisions

| Topic     | Choice                                                                                      | Why                                                                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Postgres  | Two services, image `ghcr.io/railwayapp-templates/postgres-ssl:18`                          | The schema needs Postgres 18 (`uuidv7()`); the template's default is older. Public access is per service: the demo's can get a TCP proxy for the data track while production never has a public port |
| Roles     | Per database an owner (migrations) and an app role (rows only), from `deploy/db/*.sql`      | A compromised API cannot drop or alter tables. The owner has no `CREATEROLE`, so the analytics group role is created by the script                                                                   |
| TLS       | Railway's edge issues certificates; Caddy speaks plain HTTP on `$PORT`                      | One certificate owner, no ACME in the container                                                                                                                                                      |
| Client IP | Edge's `X-Real-IP` -> Caddy -> one `X-Forwarded-For` entry, API `TRUST_PROXY=1`             | Railway documents `X-Real-IP`, not `X-Forwarded-For`; checked after the first deploy (section 4)                                                                                                     |
| Settings  | Dashboard, written down here                                                                | Config as Code (`railway.json`) stops being read on 2026-12-01; Infrastructure as Code (`.railway/railway.ts`) needs a Railway token in GitHub: a later step                                         |
| Deploys   | GitHub autodeploy from `main` with "Wait for CI"; migrations as the pre-deploy command      | A commit that failed CI never deploys; a failed migration stops the deploy and the old deployment keeps serving                                                                                      |
| Domains   | Hobby allows two per service: apex and `demo` on `web`; `www` by a Cloudflare redirect rule | No third service just for a redirect                                                                                                                                                                 |
| Backups   | Railway volume backups (daily + weekly); offsite encrypted dumps to S3 later                | Restore inside Railway from day one; offsite copy is a separate step                                                                                                                                 |

## 3. One-time setup

Needs the Railway CLI (`npm install --global @railway/cli`, then `railway login`) for the database steps; everything else is in the dashboard. Commands run from the repository root.

### 3.1 Project and usage limit

1. New project `splinance`, environment `production`, region **EU West (Amsterdam)**.
2. Account -> Usage: a hard limit (about $10), so a runaway service cannot cost more than that.

### 3.2 The two Postgres services

For `postgres` and then `postgres-demo`:

1. New service from the image `ghcr.io/railwayapp-templates/postgres-ssl:18` (check that the tag exists), with a volume mounted where the template mounts it. Name it exactly `postgres` / `postgres-demo` (the variable references below use the names).
2. Settings -> Networking: no public access (for `postgres-demo` too, until the data track needs it).
3. Backups: daily and weekly schedules (`postgres-demo`: daily is enough).
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

## 4. First-deploy checklist

1. **Headers:** `curl -I https://splinance.com/login` shows HSTS, CSP (`script-src 'self' 'sha256-...'`), `nosniff`, `Referrer-Policy: no-referrer`, no `Server`; `curl -I https://splinance.com/api/health/ready` shows Helmet's headers. Same for the demo.
2. **Client IP:** the API log line of your request shows your IP, not Railway's. Send `curl -H "X-Real-IP: 203.0.113.9" -H "X-Forwarded-For: 203.0.113.9" https://splinance.com/api/health/live`: the log must still show your real IP. If it shows the forged one, fix that before relying on rate limits.
3. **Cookies:** after login the refresh cookie is `Secure; HttpOnly; SameSite=Strict; Path=/api/auth`, without `Domain` (host-only), on both hosts.
4. **Registration:** a non-allowlisted email gets "Sign-ups are invite-only for now".
5. **Demo:** "Try the demo" works; `https://splinance.com/api/demo` is 404; the `api-demo` log shows the hourly cleanup.
6. **Pre-deploy gate:** a deploy whose migration fails stops before going live (read one deploy log, or try it on a throwaway branch environment).
7. **Restore drill:** restore yesterday's `postgres-demo` backup, check that the household is there, note how long it took, switch back.
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

  It runs on the production roles from `deploy/db` (migrations as the owner, the API as the app role) on one Postgres server.

- **Secrets:** rotating `JWT_ACCESS_SECRET` signs everyone out within 15 minutes (access tokens), refresh cookies keep working. Role passwords: `ALTER ROLE ... PASSWORD` over `railway ssh`, then the variable, then redeploy.
- **Data track:** when the pipeline reads the deployed demo (D5 switch), enable the TCP proxy on `postgres-demo` only, connect as `splinance_demo_analytics` with `sslmode=verify-ca` and the server's certificate pinned (the image's certificate is self-signed); see [data-track.md](data-track.md).
