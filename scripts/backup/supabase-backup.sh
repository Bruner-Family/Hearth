#!/usr/bin/env bash
# Self-managed nightly backup of the Hearth Supabase project (Postgres + Storage)
# to a private GCS bucket. Design: docs/superpowers/specs/2026-06-18-supabase-backup-design.md
# Restore: docs/runbooks/restore-supabase.md
#
# Required env (see .github/workflows/backup.yml):
#   SUPABASE_DB_URL                session-pooler connection string (incl. password)
#   SUPABASE_S3_ACCESS_KEY_ID      Supabase Storage S3 access key id
#   SUPABASE_S3_SECRET_ACCESS_KEY  Supabase Storage S3 secret
#   SUPABASE_S3_ENDPOINT           e.g. https://<ref>.supabase.co/storage/v1/s3
#   SUPABASE_S3_REGION             e.g. us-east-1 (AWS CLI needs a value; Supabase ignores it)
#   GCS_BACKUP_BUCKET              private bucket name (no gs:// prefix)
# Optional:
#   STORAGE_BUCKET                 Supabase Storage bucket to copy (default: attachments)
#   WORKDIR                        scratch dir (default: a fresh mktemp -d)
set -euo pipefail

STORAGE_BUCKET="${STORAGE_BUCKET:-attachments}"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }

# Fail (return 1) if any named env var is unset or empty.
require_env() {
  local missing=0 name
  for name in "$@"; do
    if [[ -z "${!name:-}" ]]; then
      log "ERROR: required env var $name is unset or empty"
      missing=1
    fi
  done
  return "$missing"
}

# UTC date-stamped object prefix for today's backup.
backup_prefix() {
  date -u +%Y-%m-%d
}

# Fail (return 1) if the file is missing/empty, or — for *.gz — not valid gzip.
verify_artifact() {
  local f="$1"
  if [[ ! -s "$f" ]]; then
    log "ERROR: artifact missing or empty: $f"
    return 1
  fi
  if [[ "$f" == *.gz ]]; then
    if ! gzip -t "$f" 2>/dev/null; then
      log "ERROR: gzip integrity check failed: $f"
      return 1
    fi
  fi
  return 0
}

# main is added in Task 2; the executable guard is added in Task 2 as well.
