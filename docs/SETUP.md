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

## Smoke test

After everything above: open `https://home.bruner.family`, sign in with a
Pocket-ID account, add an item with a purchase date, confirm it appears on
the timeline at the top of the Home tab, and hard-refresh `/items/<id>` to
confirm the SPA fallback works.
