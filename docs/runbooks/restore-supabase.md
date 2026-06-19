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
