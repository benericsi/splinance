#!/bin/sh
# The smoke stack's Postgres on first start: prod.sql, demo.sql and backup.sql exactly as
# production runs them, on one server, with throwaway passwords. The images then migrate as
# the owners and run as the app roles, and the backup job dumps both databases as the backup
# roles, so CI proves the production privileges are enough (and no more).
set -eu
run() {
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres "$@"
}
run -v owner_password=smoke-owner -v app_password=smoke-app -f /deploy-db/prod.sql
run -v owner_password=smoke-demo-owner -v app_password=smoke-demo-app \
  -v analytics_password=smoke-analytics -f /deploy-db/demo.sql
run -v db=splinance -v role=splinance_backup -v backup_password=smoke-backup \
  -f /deploy-db/backup.sql
run -v db=splinance_demo -v role=splinance_demo_backup -v backup_password=smoke-demo-backup \
  -f /deploy-db/backup.sql
