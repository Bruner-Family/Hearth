#!/usr/bin/env bash
# Proves the database dump round-trips: seed a local Supabase stack, dump it with
# the backup script's dump_database(), reset the stack, reload the dump, and
# assert public + auth rows survive. Needs Docker. Runs locally and in CI.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/backup/supabase-backup.sh
source "$ROOT/scripts/backup/supabase-backup.sh"

LOCAL_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

log "Starting local Supabase stack"
supabase start

log "Reading local service-role key and API URL"
SERVICE_KEY="$(supabase status -o json | python3 -c 'import sys,json;print(json.load(sys.stdin)["SERVICE_ROLE_KEY"])')"
API_URL="$(supabase status -o json | python3 -c 'import sys,json;print(json.load(sys.stdin)["API_URL"])')"

log "Seeding one auth user (via Auth admin API) and one public.households row"
# Delete the test user if it already exists (idempotent re-runs).
existing_uid="$(psql "$LOCAL_DB_URL" -tAc \
  "select id from auth.users where email='roundtrip@example.com' limit 1;" | tr -d '[:space:]')"
if [[ -n "$existing_uid" ]]; then
  curl -fsS -X DELETE "$API_URL/auth/v1/admin/users/$existing_uid" \
    -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" >/dev/null
fi
curl -fsS -X POST "$API_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"roundtrip@example.com","password":"roundtrip-pw-123","email_confirm":true}' >/dev/null
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -c \
  "insert into public.households (name, created_by) select 'Roundtrip House', id from auth.users where email = 'roundtrip@example.com';"

log "Dumping the seeded stack with the backup script"
WORK="$(mktemp -d)"
SUPABASE_DB_URL="$LOCAL_DB_URL" dump_database "$WORK"

log "Asserting the data dump captured both public and auth data"
gunzip -kf "$WORK/data.sql.gz"
grep -q "Roundtrip House" "$WORK/data.sql" || { log "ASSERT FAILED: public data not in dump"; exit 1; }
grep -q "roundtrip@example.com" "$WORK/data.sql" || { log "ASSERT FAILED: auth data not in dump"; exit 1; }
log "ASSERT OK: dump captures public + auth data"

log "Resetting the stack to a clean migrated state, then reloading the dump"
supabase db reset
# Truncate all public tables and auth data so the migration-seeded rows don't
# conflict with the dump's COPY commands during the reload.
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 <<'TRUNCATE_SQL'
set session_replication_role = replica;
-- public: truncate leaf tables first, then roots, relying on replica mode to
-- skip FK checks so a single pass in any order works.
truncate table public.attachments, public.maintenance_logs,
  public.maintenance_schedules, public.notification_settings,
  public.household_invites, public.household_members,
  public.items, public.households, public.item_categories
cascade;
-- auth: clear dependent tables before users
truncate table auth.identities, auth.sessions, auth.refresh_tokens,
  auth.mfa_factors, auth.flow_state cascade;
truncate table auth.users cascade;
TRUNCATE_SQL
# Disable FK/triggers during the bulk reload so table order does not matter.
{ echo "set session_replication_role = replica;"; cat "$WORK/data.sql"; } \
  | psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1

assert_count() {
  local label="$1" query="$2" expected="$3" actual
  actual="$(psql "$LOCAL_DB_URL" -tAc "$query" | tr -d '[:space:]')"
  if [[ "$actual" != "$expected" ]]; then
    log "ASSERT FAILED: $label expected $expected got $actual"
    exit 1
  fi
  log "ASSERT OK: $label = $actual"
}

assert_count "auth.users restored" \
  "select count(*) from auth.users where email='roundtrip@example.com';" "1"
assert_count "public.households restored" \
  "select count(*) from public.households where name='Roundtrip House';" "1"

rm -rf "$WORK"
log "Round-trip verification PASSED"
