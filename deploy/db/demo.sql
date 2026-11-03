-- The demo Postgres: like prod.sql, plus the data track's read-only login. Run once as the
-- superuser, before the first deploy (docs/deploy.md). Passwords arrive as psql variables:
--   psql -v ON_ERROR_STOP=1 -v owner_password=... -v app_password=... \
--        -v analytics_password=... -f demo.sql
\set ON_ERROR_STOP on

CREATE ROLE splinance_demo_owner LOGIN PASSWORD :'owner_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE splinance_demo_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
SELECT 'CREATE ROLE splinance_analytics_reader NOLOGIN'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'splinance_analytics_reader') \gexec

-- The pipeline (D5): only what the analytics views show, read-only, a few connections. It is
-- the one role a public TCP proxy would ever expose, so its password is long and random.
CREATE ROLE splinance_demo_analytics LOGIN PASSWORD :'analytics_password'
  IN ROLE splinance_analytics_reader CONNECTION LIMIT 3;
ALTER ROLE splinance_demo_analytics SET default_transaction_read_only = on;
ALTER ROLE splinance_demo_analytics SET statement_timeout = '5min';

-- The name must end in _demo: the API refuses DEMO_MODE on anything else.
CREATE DATABASE splinance_demo OWNER splinance_demo_owner;
REVOKE ALL ON DATABASE splinance_demo FROM PUBLIC;
GRANT CONNECT ON DATABASE splinance_demo TO splinance_demo_app, splinance_demo_analytics;

\connect splinance_demo
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO splinance_demo_app;
ALTER DEFAULT PRIVILEGES FOR ROLE splinance_demo_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO splinance_demo_app;
ALTER DEFAULT PRIVILEGES FOR ROLE splinance_demo_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO splinance_demo_app;
