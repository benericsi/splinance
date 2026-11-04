-- The nightly backup job's login (deploy/backup, docs/deploy.md "Backups"): reads every table,
-- view and sequence, writes nothing. Run once per server as the superuser, after prod.sql or
-- demo.sql. The password arrives as a psql variable, never in this file:
--   psql -v ON_ERROR_STOP=1 -v db=splinance -v role=splinance_backup \
--        -v backup_password=... -f backup.sql
\set ON_ERROR_STOP on

-- pg_read_all_data (Postgres 14+): SELECT on everything and USAGE on every schema, including
-- tables and schemas that later migrations create, so no migration has to grant anything.
-- It cannot write, alter or create. Read-only by default on top, and two connections at most
-- (the job uses one for the snapshot and one for pg_dump).
CREATE ROLE :"role" LOGIN PASSWORD :'backup_password' NOSUPERUSER NOCREATEDB NOCREATEROLE
  CONNECTION LIMIT 2 IN ROLE pg_read_all_data;
ALTER ROLE :"role" SET default_transaction_read_only = on;

-- prod.sql and demo.sql revoke CONNECT from PUBLIC, so the role reaches only this database.
GRANT CONNECT ON DATABASE :"db" TO :"role";
