#!/usr/bin/env bash
# Unit tests for the pure helpers in supabase-backup.sh. No external services.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/backup/supabase-backup.sh
source "$DIR/supabase-backup.sh"

fails=0
ok()  { printf 'ok   - %s\n' "$1"; }
bad() { printf 'FAIL - %s\n' "$1"; fails=$((fails + 1)); }

# backup_prefix: matches YYYY-MM-DD (UTC today)
if [[ "$(backup_prefix)" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  ok "backup_prefix is YYYY-MM-DD"
else
  bad "backup_prefix is YYYY-MM-DD (got '$(backup_prefix)')"
fi

# require_env: passes when set, fails when missing/empty
if ( export PRESENT=x; require_env PRESENT ); then
  ok "require_env passes when set"
else
  bad "require_env passes when set"
fi
if ( unset MISSING; require_env MISSING ) 2>/dev/null; then
  bad "require_env fails when missing"
else
  ok "require_env fails when missing"
fi

# verify_artifact: empty fails, non-empty plain passes, valid gzip passes, corrupt gzip fails
tmp="$(mktemp -d)"
: > "$tmp/empty.txt"
printf 'data' > "$tmp/plain.txt"
printf 'data' | gzip -c > "$tmp/good.gz"
printf 'not gzip' > "$tmp/bad.gz"

if verify_artifact "$tmp/empty.txt" 2>/dev/null; then bad "verify_artifact rejects empty"; else ok "verify_artifact rejects empty"; fi
if verify_artifact "$tmp/plain.txt" 2>/dev/null; then ok "verify_artifact accepts non-empty plain"; else bad "verify_artifact accepts non-empty plain"; fi
if verify_artifact "$tmp/good.gz" 2>/dev/null; then ok "verify_artifact accepts valid gzip"; else bad "verify_artifact accepts valid gzip"; fi
if verify_artifact "$tmp/bad.gz" 2>/dev/null; then bad "verify_artifact rejects corrupt gzip"; else ok "verify_artifact rejects corrupt gzip"; fi

rm -rf "$tmp"
[[ "$fails" -eq 0 ]] || { printf '\n%d test(s) failed\n' "$fails"; exit 1; }
printf '\nAll tests passed\n'
