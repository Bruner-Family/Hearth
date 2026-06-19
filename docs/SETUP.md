# Hearth — One-Time Setup

Everything required to take this repo from clone to running at
`home.bruner.family`. These steps touch external systems (Supabase,
Pocket-ID, GCP, Cloudflare, GitHub) and only need to be done once.
Architecture background: [ADR-001](adrs/ADR-001-home-asset-tracker.md).

## 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com) (or self-host —
   see the ADR §3 risk note about verifying custom-OIDC parity first).
   Pick a region close to the household.
2. From **Project Settings → API**, note:
   - the **project ref** (the `xyz` in `https://xyz.supabase.co`)
   - the **project URL**
   - the **publishable (`anon`) key**
3. From **Project Settings → Database**, note the **database password**
   (needed for CLI migrations).
4. Apply the schema from the repo root:

   ```sh
   supabase link --project-ref <ref>
   supabase db push
   ```

   This runs all migrations in `supabase/migrations/`: core schema, RLS
   policies + `accept_invite` RPC, category seed data, and the
   `attachments` Storage bucket with its policies.

## 2. Pocket-ID OIDC client

1. In the Pocket-ID admin, create a new OIDC client:
   - Grant type: **authorization code + PKCE**
   - Redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
   - Scopes: `openid email profile` — Supabase needs the verified `email`
     claim; the invite flow (`accept_invite`) matches on it.
2. Note the **client ID** and **client secret**.
3. Create a Pocket-ID user account for each household member. This is the
   actual access-control gate (ADR §2.3): no Pocket-ID account, no sign-in.
   On first sign-in Supabase auto-creates the user, and the
   `handle_new_user` trigger gives them a default household with owner
   membership — onboarding is zero-touch from there.

## 3. Wire Pocket-ID into Supabase

1. Supabase Dashboard → **Authentication → Sign In / Providers →
   Custom Providers** → add a provider named `pocket-id`
   (the app signs in with `custom:pocket-id`).
2. Enter the Pocket-ID **issuer URL** (e.g. `https://id.bruner.family`) and
   the client ID/secret from step 2. Supabase resolves endpoints and JWKS
   from `{issuer}/.well-known/openid-configuration` automatically.
3. **Authentication → URL Configuration**:
   - Site URL: `https://home.bruner.family`
   - Additional redirect URLs: `http://localhost:8081` (local dev)

## 4. GCP — bucket + Workload Identity Federation

1. Create a GCS bucket for the static export (name goes in the
   `GCS_BUCKET` secret, no `gs://` prefix).
2. Create a deployer service account with **Storage Object Admin** on that
   bucket only.
3. Set up Workload Identity Federation so GitHub Actions deploys without a
   long-lived key:
   - Create a Workload Identity Pool with an OIDC provider trusting
     `https://token.actions.githubusercontent.com`.
   - Restrict it with an attribute condition on this repository, e.g.
     `assertion.repository == 'Bruner-Family/Home'`. Note: the OIDC
     token's repository claim carries the repo's canonical owner (the
     `Bruner-Family` org) — GitHub redirects mask transfers in URLs and
     API calls, but IAM principal matching is exact, so a binding on a
     pre-transfer name silently stops matching.
   - Grant the pool identity `roles/iam.workloadIdentityUser` on the
     deployer service account.
4. This yields the two values the workflow needs:
   - `GCP_WORKLOAD_IDENTITY_PROVIDER` —
     `projects/<num>/locations/global/workloadIdentityPools/<pool>/providers/<provider>`
   - `GCP_SERVICE_ACCOUNT` — the deployer SA email

## 5. Cloudflare — DNS, TLS, SPA fallback, cache purge

1. Point `home.bruner.family` at the bucket (proxied CNAME to
   `c.storage.googleapis.com` with the bucket named after the hostname, or
   front it with a Worker).
2. Configure the **SPA fallback** — GCS will 404 on a hard refresh of a
   client-side route like `/items/<id>`, so something must serve
   `index.html` (with a 200) for paths that don't match a real object.
   Options, pick one:
   - a small Cloudflare Worker that tries the asset and falls back to
     `/index.html`;
   - the bucket's website configuration with `index.html` as the 404 page
     (serves a 404 status; works, but is the cruder option).
3. Create an API token scoped to **Zone → Cache Purge** for the zone →
   `CLOUDFLARE_API_TOKEN`, and note the zone ID from the dashboard
   overview → `CLOUDFLARE_ZONE_ID`.

## 6. GitHub Actions secrets

Repo → **Settings → Secrets and variables → Actions**. The deploy workflow
([`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)) expects:

| Secret                           | Source                                          |
| -------------------------------- | ----------------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`       | Supabase project URL (step 1)                   |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY`  | Supabase publishable key (step 1)               |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload identity provider resource (step 4)    |
| `GCP_SERVICE_ACCOUNT`            | Deployer service account email (step 4)         |
| `GCS_BUCKET`                     | Bucket name, no `gs://` prefix (step 4)         |
| `CLOUDFLARE_ZONE_ID`             | Zone overview page (step 5)                     |
| `CLOUDFLARE_API_TOKEN`           | Token with Zone.Cache Purge (step 5)            |
| `SUPABASE_ACCESS_TOKEN`          | supabase.com → Account → Access Tokens          |
| `SUPABASE_PROJECT_REF`           | Project ref (step 1)                            |
| `SUPABASE_DB_PASSWORD`           | Database password (step 1)                      |

The two `EXPO_PUBLIC_*` values are public by design (RLS is the
enforcement boundary) — they're secrets only to keep environment
configuration out of the repo.

## 7. Local development

```sh
cp .env.example .env    # fill in the two EXPO_PUBLIC_* values from step 1
npm install
npm run web             # http://localhost:8081
```

To exercise the database locally (including the pgTAP RLS tests):

```sh
supabase db start
supabase test db
```

## 8. Notifications (v1.3)

Weekly maintenance digest, delivered by the `notify` Edge Function on a
pg_cron schedule. Background: [ADR-003](adrs/ADR-003-notifications.md).

1. Set the Edge Function secret:

   ```sh
   supabase secrets set CRON_SECRET=$(openssl rand -hex 32)
   ```

   Note the generated value down — it's needed again in step 2 and step 4.

2. Add the Vault secrets the cron job reads (Dashboard → Project Settings →
   Vault, or SQL editor):

   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
   select vault.create_secret('<the CRON_SECRET value>', 'cron_secret');
   ```

3. Run [`supabase/cron/weekly-notifications.sql`](../supabase/cron/weekly-notifications.sql)
   once in the SQL editor. This enables `pg_cron`/`pg_net` and schedules the
   weekly job (Mondays 13:00 UTC).

4. Verify the function responds:

   ```sh
   curl -X POST https://<ref>.supabase.co/functions/v1/notify \
     -H "x-cron-secret: <value>"
   ```

   Expect `{"ok":true,...}`.

5. Per-household config — webhook URLs, Telegram bot token/chat ID, lead
   time — is entered in the app under **Settings → Notifications** (owner
   only).

## 9. Nightly backups (v1.5)

The backup workflow (`.github/workflows/backup.yml`) requires three one-time
prerequisites that live outside this repo.

### 9.1 GCS backup bucket (IaC repo)

The private bucket, its public-access prevention, the 30-day lifecycle rule,
and the IAM binding are managed in the separate IaC/Terraform repo — **not
here**. Add the following resources and apply:

```hcl
resource "google_storage_bucket" "supabase_backup" {
  name                        = "hearth-supabase-backup" # becomes GCS_BACKUP_BUCKET
  location                    = "US"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = 30 # days — mirrors scripts/backup/gcs-lifecycle.json
    }
  }
}

# Reuse the existing deployer SA (GCP_SERVICE_ACCOUNT from step 4).
resource "google_storage_bucket_iam_member" "supabase_backup_writer" {
  bucket = google_storage_bucket.supabase_backup.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:<GCP_SERVICE_ACCOUNT email>"
}
```

```sh
terraform apply
```

The bucket name (no `gs://` prefix) becomes the `GCS_BACKUP_BUCKET` secret.

### 9.2 Supabase credentials

**Session-pooler DB URL (`SUPABASE_DB_URL`)**
Supabase Dashboard → **Project Settings → Database → Connection string** →
select **Session pooler** (port 5432). Copy the full URL including the password.

**Storage S3 keypair**
Supabase Dashboard → **Project Settings → Storage → S3 Access Keys** →
**Generate new keypair**. This yields:

| Value             | Secret name                    |
| ----------------- | ------------------------------ |
| Access Key ID     | `SUPABASE_S3_ACCESS_KEY_ID`    |
| Secret Access Key | `SUPABASE_S3_SECRET_ACCESS_KEY`|

The remaining two S3 values are derived from the project ref (no dashboard
action required):

| Value                                         | Secret name             |
| --------------------------------------------- | ----------------------- |
| `https://<ref>.supabase.co/storage/v1/s3`    | `SUPABASE_S3_ENDPOINT`  |
| Any non-empty string, e.g. `us-east-1`        | `SUPABASE_S3_REGION`    |

> Supabase ignores the region value; the AWS CLI requires it to be set.

### 9.3 New GitHub Actions secrets

Repo → **Settings → Secrets and variables → Actions**. Add the six secrets
below (the backup workflow also reuses `GCP_WORKLOAD_IDENTITY_PROVIDER` and
`GCP_SERVICE_ACCOUNT` from step 4 — no changes needed there):

Generate the encryption key once and store it somewhere safe (password manager):

```sh
openssl rand -hex 32
```

| Secret                          | Source                                              |
| ------------------------------- | --------------------------------------------------- |
| `SUPABASE_DB_URL`               | Session-pooler connection string (step 9.2)         |
| `SUPABASE_S3_ACCESS_KEY_ID`     | Supabase Storage S3 key (step 9.2)                  |
| `SUPABASE_S3_SECRET_ACCESS_KEY` | Supabase Storage S3 secret (step 9.2)               |
| `SUPABASE_S3_ENDPOINT`          | `https://<ref>.supabase.co/storage/v1/s3`           |
| `SUPABASE_S3_REGION`            | Any non-empty value, e.g. `us-east-1`               |
| `GCS_BACKUP_BUCKET`             | Backup bucket name, no `gs://` prefix (step 9.1)   |
| `BACKUP_ENCRYPTION_KEY`         | 64-char hex string from `openssl rand -hex 32`      |

### 9.4 Verify first run

Once secrets and bucket are in place, trigger the workflow manually:

```sh
gh workflow run backup.yml
```

Confirm the four artifacts land in `gs://<GCS_BACKUP_BUCKET>/<YYYY-MM-DD>/`
(`roles.sql.gz`, `schema.sql.gz`, `data.sql.gz`, `storage.tar.gz`).

---

## Smoke test

After everything above: open `https://home.bruner.family`, sign in with a
Pocket-ID account, add an item with a purchase date, confirm it appears on
the timeline at the top of the Home tab, and hard-refresh `/items/<id>` to
confirm the SPA fallback works.
