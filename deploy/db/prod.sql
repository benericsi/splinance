-- The production Postgres: database, roles and privileges. Run once as the superuser, before
-- the first deploy (docs/deploy.md). Passwords arrive as psql variables, never in this file:
--   psql -v ON_ERROR_STOP=1 -v owner_password=... -v app_password=... -f prod.sql
\set ON_ERROR_STOP on

-- Runs the migrations (MIGRATE_DATABASE_URL). Owns the database, and with it the public
-- schema (Postgres 15+: pg_database_owner), so it can create and alter everything in it.
CREATE ROLE splinance_owner LOGIN PASSWORD :'owner_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
-- The API at runtime (DATABASE_URL): reads and writes rows, cannot change the schema.
CREATE ROLE splinance_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
-- The analytics migration (0013) grants its views to this group role and would create it,
-- but the owner may not create roles. Production never gets a login role in it.
SELECT 'CREATE ROLE splinance_analytics_reader NOLOGIN'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'splinance_analytics_reader') \gexec

CREATE DATABASE splinance OWNER splinance_owner;
-- Every role may connect to every database by default; here only the two above.
REVOKE ALL ON DATABASE splinance FROM PUBLIC;
GRANT CONNECT ON DATABASE splinance TO splinance_app;

\connect splinance
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO splinance_app;
-- Every table and sequence the owner's migrations create, now and later: rows for the app.
ALTER DEFAULT PRIVILEGES FOR ROLE splinance_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO splinance_app;
ALTER DEFAULT PRIVILEGES FOR ROLE splinance_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO splinance_app;
