#!/usr/bin/env bash
# Unit tests for the pure helpers in supabase-backup.sh. No external services.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/backup/supabase-backup.sh
source "$DIR/supabase-backup.sh"

fails=0
ok()   { printf 'ok   - %s\n' "$1"; }
bad()  { printf 'FAIL - %s\n' "$1"; fails=$((fails + 1)); }

# backup_prefix: matches YYYY-MM-DD (UTC today)
if [[ "$(backup_prefix)" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  ok "backup_prefix is YYYY-MM-DD"
else
  bad "backup_prefix is YYYY-MM-DD (got '$(backup_prefix)')"
fi

# require_env: passes when set, fails when missing/empty
( export PRESENT=x; require_env PRESENT ) && ok "require_env passes when set" \
  || bad "require_env passes when set"
( unset MISSING; require_env MISSING ) 2>/dev/null \
  && bad "require_env fails when missing" || ok "require_env fails when missing"

# verify_artifact: empty file fails, non-empty plain file passes,
# valid gzip passes, corrupt gzip fails
tmp="$(mktemp -d)"
: > "$tmp/empty.txt"
printf 'data' > "$tmp/plain.txt"
printf 'data' | gzip -c > "$tmp/good.gz"
printf 'not gzip' > "$tmp/bad.gz"

verify_artifact "$tmp/empty.txt" 2>/dev/null && bad "verify_artifact rejects empty" || ok "verify_artifact rejects empty"
verify_artifact "$tmp/plain.txt" 2>/dev/null && ok "verify_artifact accepts non-empty plain" || bad "verify_artifact accepts non-empty plain"
verify_artifact "$tmp/good.gz" 2>/dev/null && ok "verify_artifact accepts valid gzip" || bad "verify_artifact accepts valid gzip"
verify_artifact "$tmp/bad.gz" 2>/dev/null && bad "verify_artifact rejects corrupt gzip" || ok "verify_artifact rejects corrupt gzip"

rm -rf "$tmp"
[[ "$fails" -eq 0 ]] || { printf '\n%d test(s) failed\n' "$fails"; exit 1; }
printf '\nAll tests passed\n'
