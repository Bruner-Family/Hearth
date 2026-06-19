# Supabase Backup (Free, Self-Managed) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A nightly GitHub Actions job that dumps the production Supabase Postgres (app + `auth` data) and copies the Storage `attachments` bucket to a private GCS bucket with 30-day retention, plus a test-verified restore runbook.

**Architecture:** A single bash script (`scripts/backup/supabase-backup.sh`) holds all backup logic as small functions; a scheduled workflow (`.github/workflows/backup.yml`) supplies credentials and runs it. Verification is automated: pure helpers get a bash unit test, the whole script is shellcheck-clean, and a round-trip script (`scripts/backup/verify-restore.sh`) dumps a seeded local Supabase stack and reloads it into a reset stack, asserting `public` and `auth` data survive. A restore runbook is written from that proven procedure.

**Tech Stack:** Bash, GitHub Actions, Supabase CLI (`db dump`), AWS CLI (`s3 sync` against Supabase's S3 endpoint), `gcloud storage`, GCP Workload Identity Federation.

**Spec:** `docs/superpowers/specs/2026-06-18-supabase-backup-design.md`

---

## File Structure

- `scripts/backup/supabase-backup.sh` — the backup logic: env validation, three DB dumps, Storage sync, integrity guards, GCS upload. Functions are sourceable; `main` runs only when executed directly.
- `scripts/backup/supabase-backup.test.sh` — no-framework bash unit test for the pure helpers (`require_env`, `backup_prefix`, `verify_artifact`).
- `scripts/backup/verify-restore.sh` — local round-trip: seed → dump → reset → reload → assert. Runs locally and in CI; needs Docker.
- `scripts/backup/gcs-lifecycle.json` — documentation-parity copy of the 30-day lifecycle rule (authoritative copy lives in the IaC repo).
- `.github/workflows/backup.yml` — `validate` + `restore-roundtrip` jobs (on PR) and the scheduled `backup` job (cron + manual).
- `docs/runbooks/restore-supabase.md` — the restore procedure, written from the verified round-trip.

**Note on scope vs. spec:** The spec's "verify auth.users round-trips" is implemented by restoring into a **reset local Supabase stack** (which has the managed `auth`/`storage` schemas). A bare `createdb` target is infeasible because `public` tables FK-reference `auth.users`; this also matches reality (a real restore target is always a managed Supabase project). We dump `public` + `auth` data only; `storage.objects` rows are intentionally **not** dumped — re-uploading the files recreates them (spec "Restore" section).

---

## Task 1: Backup script — pure helpers (TDD)

Create the script shell with the three pure, testable helpers and a sourcing guard, driven by a bash unit test. No external tools are touched yet.

**Files:**
- Create: `scripts/backup/supabase-backup.sh`
- Test: `scripts/backup/supabase-backup.test.sh`

- [ ] **Step 1: Write the failing test**

Create `scripts/backup/supabase-backup.test.sh`:

```bash
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash scripts/backup/supabase-backup.test.sh`
Expected: FAIL — `supabase-backup.sh` does not exist yet, so `source` errors with "No such file or directory".

- [ ] **Step 3: Create the script with the pure helpers**

Create `scripts/backup/supabase-backup.sh`:

```bash
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash scripts/backup/supabase-backup.test.sh`
Expected: PASS — ends with "All tests passed".

- [ ] **Step 5: Lint the script**

Run: `shellcheck scripts/backup/supabase-backup.sh scripts/backup/supabase-backup.test.sh`
Expected: exits 0, no findings. (If `shellcheck` is not installed locally: `brew install shellcheck` on macOS; it is preinstalled on GitHub `ubuntu-latest`.)

- [ ] **Step 6: Commit**

```bash
chmod +x scripts/backup/supabase-backup.sh scripts/backup/supabase-backup.test.sh
git add scripts/backup/supabase-backup.sh scripts/backup/supabase-backup.test.sh
git commit -m "feat(backup): backup script helpers (env, prefix, integrity) + unit test"
```

---

## Task 2: Backup script — dump, sync, upload, main

Add the side-effecting functions and `main`. These touch external tools, so they are not unit-tested here; they are exercised end-to-end in Task 4 and gated by shellcheck now.

**Files:**
- Modify: `scripts/backup/supabase-backup.sh`

- [ ] **Step 1: Append the dump/sync/upload functions and main**

In `scripts/backup/supabase-backup.sh`, replace the final line:

```bash
# main is added in Task 2; the executable guard is added in Task 2 as well.
```

with:

```bash
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
upload_to_gcs() {
  local outdir="$1" prefix="$2"
  local dest="gs://$GCS_BACKUP_BUCKET/$prefix"
  log "Uploading artifacts to $dest"
  gcloud storage cp \
    "$outdir/roles.sql.gz" "$outdir/schema.sql.gz" \
    "$outdir/data.sql.gz" "$outdir/storage.tar.gz" \
    "$dest/"
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
  upload_to_gcs "$workdir" "$prefix"
  log "Backup complete: gs://$GCS_BACKUP_BUCKET/$prefix"
}

# Run main only when executed directly, so tests can source the helpers.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
```

- [ ] **Step 2: Confirm the unit test still passes (sourcing still works)**

Run: `bash scripts/backup/supabase-backup.test.sh`
Expected: PASS — "All tests passed". (The sourcing guard means `main` does not run during the test.)

- [ ] **Step 3: Lint the full script**

Run: `shellcheck scripts/backup/supabase-backup.sh`
Expected: exits 0, no findings.

- [ ] **Step 4: Confirm `main` validates env and exits non-zero when unset**

Run: `env -i bash scripts/backup/supabase-backup.sh; echo "exit=$?"`
Expected: prints `ERROR: required env var SUPABASE_DB_URL ...` (and the others) and `exit=1` — proving the guard stops a misconfigured run before touching any service.

- [ ] **Step 5: Commit**

```bash
git add scripts/backup/supabase-backup.sh
git commit -m "feat(backup): db dump, storage sync, and GCS upload"
```

---

## Task 3: Scheduled workflow + lifecycle parity + CI validation

Wire the script into GitHub Actions: a scheduled/manual `backup` job, plus a `validate` job that runs shellcheck and the unit test on PRs. Add the lifecycle-rule parity file.

**Files:**
- Create: `.github/workflows/backup.yml`
- Create: `scripts/backup/gcs-lifecycle.json`

- [ ] **Step 1: Create the lifecycle parity file**

Create `scripts/backup/gcs-lifecycle.json`:

```json
{
  "rule": [
    {
      "action": { "type": "Delete" },
      "condition": { "age": 30 }
    }
  ]
}
```

(Documentation parity only — the authoritative rule is applied by the IaC repo. To apply manually if ever needed: `gcloud storage buckets update gs://$GCS_BACKUP_BUCKET --lifecycle-file=scripts/backup/gcs-lifecycle.json`.)

- [ ] **Step 2: Create the workflow**

Create `.github/workflows/backup.yml`:

```yaml
# Nightly self-managed backup of the Supabase project (Postgres + Storage) to a
# private GCS bucket. Design: docs/superpowers/specs/2026-06-18-supabase-backup-design.md
#
# Required repository secrets (in addition to the GCP WIF secrets from deploy.yml):
#   SUPABASE_DB_URL                session-pooler connection string (incl. password)
#   SUPABASE_S3_ACCESS_KEY_ID      Supabase Storage S3 access key id
#   SUPABASE_S3_SECRET_ACCESS_KEY  Supabase Storage S3 secret
#   SUPABASE_S3_ENDPOINT           https://<ref>.supabase.co/storage/v1/s3
#   SUPABASE_S3_REGION             e.g. us-east-1
#   GCS_BACKUP_BUCKET              private backups bucket name (no gs:// prefix)
# Reused: GCP_WORKLOAD_IDENTITY_PROVIDER, GCP_SERVICE_ACCOUNT

name: Backup

on:
  schedule:
    - cron: "0 7 * * *" # ~midnight US, daily
  workflow_dispatch:
  pull_request:
    paths:
      - "scripts/backup/**"
      - ".github/workflows/backup.yml"

permissions:
  contents: read
  id-token: write # GCP Workload Identity Federation

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Shellcheck
        run: shellcheck scripts/backup/*.sh
      - name: Unit tests
        run: bash scripts/backup/supabase-backup.test.sh

  backup:
    # Only the scheduled/manual runs perform a real backup; PRs just validate.
    if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Authenticate to GCP
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

      - uses: google-github-actions/setup-gcloud@v2

      - name: Run backup
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
          SUPABASE_S3_ACCESS_KEY_ID: ${{ secrets.SUPABASE_S3_ACCESS_KEY_ID }}
          SUPABASE_S3_SECRET_ACCESS_KEY: ${{ secrets.SUPABASE_S3_SECRET_ACCESS_KEY }}
          SUPABASE_S3_ENDPOINT: ${{ secrets.SUPABASE_S3_ENDPOINT }}
          SUPABASE_S3_REGION: ${{ secrets.SUPABASE_S3_REGION }}
          GCS_BACKUP_BUCKET: ${{ secrets.GCS_BACKUP_BUCKET }}
        run: bash scripts/backup/supabase-backup.sh
```

(The `ubuntu-latest` runner has `shellcheck`, `aws`, and `tar`/`gzip` preinstalled; `setup-gcloud` provides `gcloud`.)

- [ ] **Step 3: Validate the workflow YAML parses**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/backup.yml')); print('yaml ok')"`
Expected: prints `yaml ok`.

- [ ] **Step 4: Re-run shellcheck + unit test exactly as CI will**

Run: `shellcheck scripts/backup/*.sh && bash scripts/backup/supabase-backup.test.sh`
Expected: shellcheck clean; test ends with "All tests passed".

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/backup.yml scripts/backup/gcs-lifecycle.json
git commit -m "ci(backup): nightly backup workflow + lifecycle parity + PR validation"
```

---

## Task 4: Verified restore round-trip + runbook

Prove the dump reloads correctly by dumping a seeded local Supabase stack and reloading it into a reset stack (which has the managed `auth`/`storage` schemas), asserting `public` and `auth` rows survive. Wire it into CI, then write the runbook from the proven steps.

**Files:**
- Create: `scripts/backup/verify-restore.sh`
- Modify: `.github/workflows/backup.yml`
- Create: `docs/runbooks/restore-supabase.md`

> **Requires Docker** (for `supabase start`/`db reset`), the same dependency the existing `rls-tests` CI job uses. If Docker is unavailable in your local environment, commit the script and let the new CI job prove it; do not skip the assertions.

- [ ] **Step 1: Write the round-trip verification script**

Create `scripts/backup/verify-restore.sh`:

```bash
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
```

- [ ] **Step 2: Run the round-trip locally to verify it passes**

Run: `bash scripts/backup/verify-restore.sh`
Expected: ends with `Round-trip verification PASSED`, including `ASSERT OK: auth.users restored = 1` and `ASSERT OK: public.households restored = 1`.
(If the data-capture assertions fail because the dump omitted a schema, the fix is in `dump_database` — confirm the `--schema public,auth` flag form against `supabase db dump --help` for the installed CLI version and adjust until both assertions pass.)

- [ ] **Step 3: Lint the new script**

Run: `shellcheck scripts/backup/verify-restore.sh`
Expected: exits 0, no findings.

- [ ] **Step 4: Add a CI job that runs the round-trip on PRs**

In `.github/workflows/backup.yml`, add this job after the `validate` job (sibling indentation, before `backup:`):

```yaml
  restore-roundtrip:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - name: Dump + restore round-trip against a local stack
        run: bash scripts/backup/verify-restore.sh
```

- [ ] **Step 5: Re-validate the workflow YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/backup.yml')); print('yaml ok')"`
Expected: prints `yaml ok`.

- [ ] **Step 6: Write the restore runbook**

Create `docs/runbooks/restore-supabase.md`:

```markdown
# Restore runbook — Supabase (Hearth)

Backups live in `gs://<GCS_BACKUP_BUCKET>/<YYYY-MM-DD>/`:
`roles.sql.gz`, `schema.sql.gz`, `data.sql.gz`, `storage.tar.gz`.
Produced by `.github/workflows/backup.yml` / `scripts/backup/supabase-backup.sh`.

## 0. Fetch a backup

```bash
DAY=2026-06-18   # the snapshot to restore
gcloud storage cp "gs://$GCS_BACKUP_BUCKET/$DAY/*" ./restore/
cd restore && gunzip -k ./*.gz
```

## 1. Database

The restore target must be a managed Supabase project (the `auth`/`storage`
schemas must already exist — Hearth's `public` tables FK-reference `auth.users`).

**In-place restore (existing project, recovering app data):**
- Reapply schema if needed: `supabase db push` (migrations are the source of truth).
- Reload data with FK enforcement deferred:

  ```bash
  { echo "set session_replication_role = replica;"; cat data.sql; } \
    | psql "$SUPABASE_DB_URL"
  ```

**From-scratch restore (new project):**
1. Create the project; run `supabase db push` to build the schema.
2. **Re-configure the Pocket-ID OIDC provider in the Supabase dashboard** — it
   is dashboard-managed, not in migrations (`config.toml`).
3. Load `roles.sql`, then `data.sql` as above. `data.sql` carries `public` +
   `auth` (users and identities) so external-identity links survive.
4. Do **not** hand-load `storage.objects`; it is recreated by the file
   re-upload in step 2 below.

## 2. Storage (attachment files)

Re-upload to the **same object paths** so `public.attachments.storage_path`
rows keep resolving:

```bash
mkdir -p storage && tar -xzf storage.tar.gz -C storage
AWS_ACCESS_KEY_ID=$SUPABASE_S3_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$SUPABASE_S3_SECRET_ACCESS_KEY \
AWS_DEFAULT_REGION=$SUPABASE_S3_REGION \
  aws s3 sync storage "s3://attachments" --endpoint-url "$SUPABASE_S3_ENDPOINT"
```

## 3. Verify

```bash
psql "$SUPABASE_DB_URL" -tAc "select count(*) from auth.users;"
psql "$SUPABASE_DB_URL" -tAc "select count(*) from public.items;"
```
Then sign in and open an item with an attachment to confirm files resolve.

> This procedure is exercised on every PR by `scripts/backup/verify-restore.sh`
> (the `restore-roundtrip` CI job), which proves `data.sql` reloads `public` +
> `auth` data into a clean stack.
```

- [ ] **Step 7: Commit**

```bash
chmod +x scripts/backup/verify-restore.sh
git add scripts/backup/verify-restore.sh .github/workflows/backup.yml docs/runbooks/restore-supabase.md
git commit -m "test(backup): verified restore round-trip + restore runbook"
```

---

## Self-Review

**Spec coverage:**
- Free/self-managed, no Pro → GitHub Actions + CLI dump + GCS (Tasks 2–3). ✅
- Postgres incl. `auth` → `dump_database` dumps roles/schema + `public,auth` data (Task 2), proven in Task 4. ✅
- Storage files → `sync_storage` via S3 endpoint → `storage.tar.gz` (Task 2). ✅
- Private GCS destination, dated prefix → `upload_to_gcs` (Task 2). ✅
- Daily schedule + 30-day retention → cron in `backup.yml` (Task 3) + `gcs-lifecycle.json` parity (Task 3); bucket/lifecycle/IAM owned by IaC (documented, not created here). ✅
- Integrity guards → `verify_artifact` + `require_env`, unit-tested (Task 1), env-guard checked (Task 2 Step 4). ✅
- IPv4/pooler, AWS-CLI-over-rclone → pooler `SUPABASE_DB_URL`, `aws s3 sync` (Tasks 2–3). ✅
- Session-pooler region secret → `SUPABASE_S3_REGION` consumed (Task 2) + in workflow env (Task 3). ✅
- Restore runbook + verified test → Task 4 (round-trip script, CI job, runbook). ✅
- Cross-store consistency + auth caveat + don't restore storage.objects → runbook (Task 4 Step 6); dump excludes `storage` schema (Task 2). ✅
- Failure visibility via GitHub default emails (no custom alerting) → no extra work, YAGNI honored. ✅

**Placeholder scan:** No TBD/TODO; every code step has complete file content; every run step has an exact command + expected output. The one conditional ("if the data-capture assertion fails, confirm the `--schema` flag form") is a TDD remedy tied to a concrete assertion gate, not a placeholder.

**Consistency:** Function names (`require_env`, `backup_prefix`, `verify_artifact`, `dump_database`, `sync_storage`, `upload_to_gcs`, `main`) are defined in Tasks 1–2 and reused identically in Task 4's `verify-restore.sh` (which sources the script). Env var names match across the script, the workflow, and the runbook. Artifact names (`roles.sql.gz`, `schema.sql.gz`, `data.sql.gz`, `storage.tar.gz`) are identical in `dump_database`/`sync_storage`/`upload_to_gcs`, the runbook, and the spec's success criteria.
