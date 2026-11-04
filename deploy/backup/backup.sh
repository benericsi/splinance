#!/usr/bin/env bash
# Nightly backup of both Splinance databases (docs/deploy.md "Backups"). The Railway cron
# service `backup` runs this once a night and expects it to exit.
#
# Per database: pg_dump -Fc and per-table row counts from one exported snapshot, both encrypted
# with age to the public keys in recipients.txt, uploaded as new S3 objects (If-None-Match: *).
# The job holds no private key and cannot list, read or delete the bucket.
#
# Environment:
#   PROD_DATABASE_URL, DEMO_DATABASE_URL   the backup roles (deploy/db/backup.sql)
#   BACKUP_BUCKET                          the S3 bucket
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (AWS_DEFAULT_REGION is set in the image)
#   HC_PING_URL                            Healthchecks.io check; a warning when unset
#   BACKUP_TARGET                          s3 (default) or dir:/path (tests: no S3)
#   AGE_RECIPIENTS_FILE                    default /etc/splinance-backup/recipients.txt
#   BACKUP_TIMEOUT                         seconds for the whole run, default 900
#
# Internal entry points (the script calls itself): run, one, dump.
set -euo pipefail

readonly RECIPIENTS=${AGE_RECIPIENTS_FILE:-/etc/splinance-backup/recipients.txt}
readonly TARGET=${BACKUP_TARGET:-s3}
# Tables whose rows stay out of every backup (their definitions are kept). sessions: refresh
# token hashes never leave the database, and a restore cannot revive a session that was
# revoked after the backup; everyone logs in again after a restore.
readonly EXCLUDE_DATA=(public.sessions)

log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() {
  log "error: $*"
  exit 1
}

# Healthchecks.io: /start, then the exit code with the end of the log as the body. The log holds
# names, sizes, timings and errors, never row data or connection strings. A failed ping never
# fails the backup.
ping_hc() {
  [[ -n ${HC_PING_URL:-} ]] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null --data-binary @- "$HC_PING_URL/$1" ||
    log "warning: Healthchecks ping failed"
}

# Default entry point: runs the backup under a timeout (a cron run that never exits would make
# Railway skip every later one) and reports the outcome, whatever it is.
supervise() {
  [[ -n ${HC_PING_URL:-} ]] || log "warning: HC_PING_URL is not set, a failure will go unnoticed"
  ping_hc start < /dev/null
  local logfile code
  logfile=$(mktemp)
  set +e
  timeout -s TERM "${BACKUP_TIMEOUT:-900}" "$0" run 2>&1 | tee "$logfile"
  code=${PIPESTATUS[0]}
  set -e
  ((code == 0)) || log "backup failed (exit $code)" | tee -a "$logfile"
  tail -c 10000 "$logfile" | ping_hc "$code"
  rm -f "$logfile"
  exit "$code"
}

run() {
  [[ -s $RECIPIENTS ]] || die "no age recipients in $RECIPIENTS"
  case $TARGET in
    s3) [[ -n ${BACKUP_BUCKET:-} ]] || die "BACKUP_BUCKET is not set" ;;
    dir:/*) ;;
    *) die "BACKUP_TARGET must be s3 or dir:/absolute/path" ;;
  esac
  log "pg_dump $(pg_dump --version | awk '{print $NF}'), age $(age --version), target $TARGET"

  local stamp failed=0
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  # Separate processes, not functions: bash ignores `set -e` inside a function called with ||.
  # Production first; a failed demo backup still fails the run, but after production is safe.
  "$0" one splinance PROD_DATABASE_URL "$stamp" monthly || failed=1
  "$0" one splinance_demo DEMO_DATABASE_URL "$stamp" daily-only || failed=1
  ((failed == 0)) || die "not every database was backed up"
  log "all backups uploaded"
}

# one <database> <name of the variable holding its URL> <timestamp> monthly|daily-only
one() {
  local db=$1 url_var=$2 stamp=$3 keep_monthly=$4
  local url=${!url_var:-}
  [[ -n $url ]] || die "$db: $url_var is not set"
  export PGCONNECT_TIMEOUT=10

  # The private network may need a moment after the container starts.
  local attempt
  for attempt in {1..12}; do
    pg_isready -q -d "$url" -t 5 && break
    ((attempt < 12)) || die "$db: database not reachable"
    sleep 5
  done

  local actual
  actual=$(psql "$url" -XqAt -c 'select current_database()')
  [[ $actual == "$db" ]] || die "$db: $url_var points at database $actual"

  local work
  work=$(mktemp -d)
  # shellcheck disable=SC2064 # expand now: $work is local
  trap "rm -rf '$work'" EXIT
  local dump=$work/dump.age counts=$work/counts
  local started=$SECONDS

  # One snapshot for the dump and the counts, so a restore must match the counts exactly.
  # psql keeps the transaction open while `\!` runs pg_dump with the exported snapshot; `\!`
  # does no variable interpolation, so the snapshot id travels as an environment variable.
  BACKUP_URL=$url BACKUP_DUMP=$dump BACKUP_SELF=$0 \
    psql "$url" -X -q -A -t -v ON_ERROR_STOP=1 -o "$counts" << 'SQL'
BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY;
SELECT pg_export_snapshot() AS snapshot \gset
\setenv BACKUP_SNAPSHOT :snapshot
\! "$BACKUP_SELF" dump
SELECT format('SELECT %L, count(*) FROM %I.%I', n.nspname || '.' || c.relname, n.nspname, c.relname)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg\_toast%'
ORDER BY 1 \gexec
COMMIT;
SQL
  [[ -f $dump.ok ]] || die "$db: pg_dump failed"

  local server_version size sha
  server_version=$(psql "$url" -XqAt -c 'show server_version')
  size=$(stat -c %s "$dump")
  sha=$(sha256sum "$dump" | cut -d ' ' -f 1)
  {
    echo "format splinance-backup/1"
    echo "database $db"
    echo "created_at $stamp"
    echo "server_version $server_version"
    echo "pg_dump_version $(pg_dump --version | awk '{print $NF}')"
    echo "dump_bytes $size"
    echo "dump_sha256 $sha"
    local t
    for t in "${EXCLUDE_DATA[@]}"; do echo "excluded_data $t"; done
    awk -F '|' '{print "table " $1 " " $2}' "$counts"
  } | age -R "$RECIPIENTS" > "$work/manifest.age"

  local tiers=(daily)
  [[ $keep_monthly == monthly && ${stamp:6:2} == 01 ]] && tiers+=(monthly)
  local tier
  for tier in "${tiers[@]}"; do
    # The dump first: a backup counts as complete once its manifest exists.
    put "$dump" "$db/$tier/$stamp.dump.age"
    put "$work/manifest.age" "$db/$tier/$stamp.manifest.txt.age"
  done
  log "$db: $(wc -l < "$counts") tables, $size bytes encrypted, $((SECONDS - started)) s, ${tiers[*]}"
}

# Runs from psql's `\!` inside the snapshot transaction (environment set by `one`).
dump() {
  local exclude=() t
  for t in "${EXCLUDE_DATA[@]}"; do exclude+=("--exclude-table-data=$t"); done
  pg_dump --format=custom --snapshot="$BACKUP_SNAPSHOT" --lock-wait-timeout=60s --no-password \
    "${exclude[@]}" --dbname="$BACKUP_URL" |
    age -R "$RECIPIENTS" > "$BACKUP_DUMP"
  touch "$BACKUP_DUMP.ok"
}

# put <file> <key>: a new object, never an overwrite.
put() {
  local file=$1 key=$2
  case $TARGET in
    s3)
      aws s3api put-object --bucket "$BACKUP_BUCKET" --key "$key" --body "$file" \
        --if-none-match '*' --checksum-algorithm SHA256 --no-cli-pager > /dev/null
      ;;
    dir:*)
      local path=${TARGET#dir:}/$key
      [[ ! -e $path ]] || die "$key exists already"
      mkdir -p "$(dirname "$path")"
      cp "$file" "$path"
      ;;
  esac
}

case ${1:-} in
  '') supervise ;;
  run) run ;;
  one)
    shift
    one "$@"
    ;;
  dump) dump ;;
  *) die "usage: backup.sh (no arguments)" ;;
esac
