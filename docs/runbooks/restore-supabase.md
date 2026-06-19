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

**Reload is destructive and replaces current data.** `data.sql` is a data-only
dump that includes the migration-seeded `public.item_categories`, so the target
tables must be truncated first or the reload collides with the seeded rows. This
mirrors the verified round-trip (`scripts/backup/verify-restore.sh`).

**From-scratch restore (new project):**
1. Create the project; run `supabase db push` to build the schema.
2. **Re-configure the Pocket-ID OIDC provider in the Supabase dashboard** — it
   is dashboard-managed, not in migrations (`config.toml`).
3. Load `roles.sql` (cluster-global): `psql "$SUPABASE_DB_URL" -f roles.sql`.
4. Truncate the seeded tables and reload data (snippet below).
5. Do **not** hand-load `storage.objects`; it is recreated by the file
   re-upload in step 2 below.

**In-place restore (existing project, recovering app data):**
1. Reapply schema if it drifted: `supabase db push`.
2. Truncate the tables and reload data (snippet below).

**Truncate + reload `data.sql`:**

  ```bash
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
  set session_replication_role = replica;
  truncate table public.attachments, public.maintenance_logs,
    public.maintenance_schedules, public.notification_settings,
    public.household_invites, public.household_members,
    public.items, public.households, public.item_categories cascade;
  truncate table auth.identities, auth.sessions, auth.refresh_tokens,
    auth.mfa_factors, auth.flow_state cascade;
  truncate table auth.users cascade;
  SQL
  { echo "set session_replication_role = replica;"; cat data.sql; } \
    | psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1
  ```

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
