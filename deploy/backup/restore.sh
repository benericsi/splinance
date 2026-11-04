#!/usr/bin/env bash
# Restore drill (docs/deploy.md "Backups"): fetch a backup, decrypt it, restore it into a fresh
# server set up like production (deploy/db), and check it against its manifest. Runs in the
# backup image next to a scratch Postgres: deploy/backup/compose.drill.yml.
#
#   restore.sh --db splinance|splinance_demo [--tier daily|monthly] [--stamp <UTC stamp>|latest]
#              [--from s3|dir:/path]
#
# Environment:
#   PGHOST, PGPORT, PGUSER, PGPASSWORD   superuser of the SCRATCH server (never production)
#   BACKUP_BUCKET + AWS credentials       for --from s3 (your own `aws login` session)
#   AGE_IDENTITY_FILE                     tests only; otherwise the identity is asked for
set -euo pipefail

log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() {
  log "error: $*"
  exit 1
}

db='' tier=daily stamp=latest from=s3
while (($#)); do
  case $1 in
    --db) db=${2:-} ;;
    --tier) tier=${2:-} ;;
    --stamp) stamp=${2:-} ;;
    --from) from=${2:-} ;;
    *) die "unknown argument $1" ;;
  esac
  shift 2
done
case $db in
  splinance) setup=prod.sql ;;
  splinance_demo) setup=demo.sql ;;
  *) die "--db must be splinance or splinance_demo" ;;
esac
[[ $tier == daily || $tier == monthly ]] || die "--tier must be daily or monthly"
[[ $from == s3 || $from == dir:/* ]] || die "--from must be s3 or dir:/absolute/path"
owner=${db}_owner app=${db}_app

# A scratch server only: production already has these roles and this database.
exists=$(psql -XqAt -d postgres -c "select count(*) from pg_database where datname = '$db'")
[[ $exists == 0 ]] || die "database $db exists on $PGHOST: restore into a fresh scratch server"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
timer=$SECONDS
lap() {
  local s=$((SECONDS - timer))
  timer=$SECONDS
  echo "$s"
}

# 1. Find and fetch the manifest and the dump.
prefix=$db/$tier
if [[ $from == s3 ]]; then
  [[ -n ${BACKUP_BUCKET:-} ]] || die "BACKUP_BUCKET is not set"
  if [[ $stamp == latest ]]; then
    key=$(aws s3api list-objects-v2 --bucket "$BACKUP_BUCKET" --prefix "$prefix/" \
      --query 'Contents[].Key' --output text | tr '\t' '\n' |
      grep '\.manifest\.txt\.age$' | sort | tail -n 1 || true)
    [[ -n $key ]] || die "no backup under s3://$BACKUP_BUCKET/$prefix/"
    stamp=$(basename "$key" .manifest.txt.age)
  fi
  aws s3 cp --only-show-errors "s3://$BACKUP_BUCKET/$prefix/$stamp.manifest.txt.age" "$work/manifest.age"
  aws s3 cp --only-show-errors "s3://$BACKUP_BUCKET/$prefix/$stamp.dump.age" "$work/dump.age"
else
  dir=${from#dir:}/$prefix
  if [[ $stamp == latest ]]; then
    key=$(find "$dir" -name '*.manifest.txt.age' 2> /dev/null | sort | tail -n 1 || true)
    [[ -n $key ]] || die "no backup under $dir"
    stamp=$(basename "$key" .manifest.txt.age)
  fi
  cp "$dir/$stamp.manifest.txt.age" "$work/manifest.age"
  cp "$dir/$stamp.dump.age" "$work/dump.age"
fi
t_fetch=$(lap)
log "backup $prefix/$stamp: $(stat -c %s "$work/dump.age") bytes, fetched in ${t_fetch} s"

# 2. The identity: read once, kept in this container's temporary folder, deleted on exit.
if [[ -n ${AGE_IDENTITY_FILE:-} ]]; then
  identity=$AGE_IDENTITY_FILE
else
  read -rsp 'age identity (AGE-SECRET-KEY-1...): ' secret
  echo
  [[ $secret == AGE-SECRET-KEY-1* ]] || die "that is not an age identity"
  identity=$work/identity
  (umask 077 && printf '%s\n' "$secret" > "$identity")
  unset secret
fi
timer=$SECONDS

age -d -i "$identity" "$work/manifest.age" > "$work/manifest"
field() { awk -v k="$1" '$1 == k {print $2; exit}' "$work/manifest"; }
[[ $(field format) == splinance-backup/1 ]] || die "unknown manifest format"
[[ $(field database) == "$db" ]] || die "manifest is for $(field database), not $db"
[[ $(sha256sum "$work/dump.age" | cut -d ' ' -f 1) == "$(field dump_sha256)" ]] ||
  die "dump does not match its manifest (sha256)"

# 3. A server like production: the role scripts with throwaway passwords.
password() { head -c 24 /dev/urandom | base64 | tr '+/' '-_' | tr -d '='; }
owner_pw=$(password) app_pw=$(password)
psql -X -q -d postgres -v ON_ERROR_STOP=1 -v owner_password="$owner_pw" -v app_password="$app_pw" \
  -v analytics_password="$(password)" -f "/etc/splinance-backup/db/$setup" > /dev/null
t_setup=$(lap)

# 4. Restore as the owner, as one transaction: all of it or nothing. --no-owner: everything
# belongs to the owner, as in production; grants to the other roles come from the dump.
age -d -i "$identity" "$work/dump.age" |
  PGUSER=$owner PGPASSWORD=$owner_pw pg_restore --exit-on-error --single-transaction --no-owner \
    --dbname="$db"
t_restore=$(lap)

# 5. Checks.
failures=0
as_owner() { PGUSER=$owner PGPASSWORD=$owner_pw psql -XqAt -d "$db" -v ON_ERROR_STOP=1 "$@"; }
as_app() { PGUSER=$app PGPASSWORD=$app_pw psql -XqAt -d "$db" -v ON_ERROR_STOP=1 "$@"; }
mapfile -t excluded < <(awk '$1 == "excluded_data" {print $2}' "$work/manifest")
tables=0
while read -r _ name expected; do
  [[ " ${excluded[*]} " == *" $name "* ]] && continue
  schema=${name%%.*} table=${name#*.}
  actual=$(as_owner -c "select count(*) from \"$schema\".\"$table\"")
  tables=$((tables + 1))
  if [[ $actual != "$expected" ]]; then
    log "MISMATCH $name: $actual rows, backup had $expected"
    failures=$((failures + 1))
  fi
done < <(awk '$1 == "table"' "$work/manifest")
log "row counts: $((tables - failures)) of $tables tables match"

if as_app -c 'select count(*) from users' > /dev/null; then
  log "app role reads rows: ok"
else
  log "FAILED: the app role cannot read users"
  failures=$((failures + 1))
fi
if as_app -c 'create table drill_should_fail (id int)' > /dev/null 2>&1; then
  log "FAILED: the app role can create tables"
  failures=$((failures + 1))
else
  log "app role cannot change the schema: ok"
fi
newest=$(as_owner -c "select coalesce(max(created_at)::text, 'none') from transactions")
t_check=$(lap)

cat << REPORT

Restore drill $(date -u +%Y-%m-%d), $db, backup $stamp ($tier)
  server at backup    $(field server_version), pg_dump $(field pg_dump_version), pg_restore $(pg_restore --version | awk '{print $NF}')
  encrypted size      $(field dump_bytes) bytes
  newest transaction  $newest
  fetch               ${t_fetch} s
  set up roles        ${t_setup} s
  decrypt + restore   ${t_restore} s
  checks              ${t_check} s
  total               $((t_fetch + t_setup + t_restore + t_check)) s
  result              $( ((failures == 0)) && echo PASSED || echo "FAILED ($failures)")
REPORT
((failures == 0))
