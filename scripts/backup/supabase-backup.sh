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

# Encrypt all .gz artifacts in outdir with AES-256-CBC if BACKUP_ENCRYPTION_KEY is set.
# Encrypted files get a .enc suffix; plaintext originals are removed.
maybe_encrypt() {
  local outdir="$1"
  [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]] && return 0
  log "Encrypting artifacts (AES-256-CBC)"
  local f
  for f in "$outdir"/*.gz; do
    openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt \
      -pass env:BACKUP_ENCRYPTION_KEY -in "$f" -out "${f}.enc"
    rm -f "$f"
  done
}

# Decrypt all .gz.enc artifacts in outdir if BACKUP_ENCRYPTION_KEY is set.
# Restores the original .gz files; encrypted files are removed.
maybe_decrypt() {
  local outdir="$1"
  [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]] && return 0
  log "Decrypting artifacts (AES-256-CBC)"
  local f
  for f in "$outdir"/*.gz.enc; do
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
      -pass env:BACKUP_ENCRYPTION_KEY -in "$f" -out "${f%.enc}"
    rm -f "$f"
  done
}

# Dump roles, schema, and (public + auth) data via the session pooler, gzipped.
# storage.objects is intentionally NOT dumped — re-uploading files recreates it.
dump_database() {
  local outdir="$1"
  log "Dumping roles"
  supabase db dump --db-url "$SUPABASE_DB_URL" --role-only -f "$outdir/roles.sql"
  log "Dumping schema"
  supabase db dump --db-url "$SUPABASE_DB_URL" -f "$outdir/schema.sql"
  log "Dumping data (public + auth)"
  supabase db dump --db-url "$SUPABASE_DB_URL" --data-only --use-copy \
    --schema public,auth -f "$outdir/data.sql"
  gzip -f "$outdir/roles.sql" "$outdir/schema.sql" "$outdir/data.sql"
  verify_artifact "$outdir/roles.sql.gz"
  verify_artifact "$outdir/schema.sql.gz"
  verify_artifact "$outdir/data.sql.gz"
}

# Mirror the Supabase Storage bucket to a local dir via the S3 endpoint, then tar.
sync_storage() {
  local outdir="$1"
  local stage="$outdir/storage"
  mkdir -p "$stage"
  log "Syncing Supabase Storage bucket '$STORAGE_BUCKET'"
  AWS_ACCESS_KEY_ID="$SUPABASE_S3_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$SUPABASE_S3_SECRET_ACCESS_KEY" \
  AWS_DEFAULT_REGION="$SUPABASE_S3_REGION" \
    aws s3 sync "s3://$STORAGE_BUCKET" "$stage" \
      --endpoint-url "$SUPABASE_S3_ENDPOINT" --no-progress
  tar -czf "$outdir/storage.tar.gz" -C "$stage" .
  rm -rf "$stage"
  verify_artifact "$outdir/storage.tar.gz"
}

# Upload all artifacts under gs://<bucket>/<YYYY-MM-DD>/.
# Works for both plaintext (.gz) and encrypted (.gz.enc) artifacts.
upload_to_gcs() {
  local outdir="$1" prefix="$2"
  local dest="gs://$GCS_BACKUP_BUCKET/$prefix"
  log "Uploading artifacts to $dest"
  local -a files=("$outdir"/*)
  gcloud storage cp "${files[@]}" "$dest/"
}

main() {
  require_env SUPABASE_DB_URL SUPABASE_S3_ACCESS_KEY_ID SUPABASE_S3_SECRET_ACCESS_KEY \
              SUPABASE_S3_ENDPOINT SUPABASE_S3_REGION GCS_BACKUP_BUCKET
  local workdir prefix
  workdir="${WORKDIR:-$(mktemp -d)}"
  prefix="$(backup_prefix)"
  log "Backup starting -> gs://$GCS_BACKUP_BUCKET/$prefix"
  dump_database "$workdir"
  sync_storage "$workdir"
  maybe_encrypt "$workdir"
  upload_to_gcs "$workdir" "$prefix"
  log "Backup complete: gs://$GCS_BACKUP_BUCKET/$prefix"
}

# Run main only when executed directly, so tests can source the helpers.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
