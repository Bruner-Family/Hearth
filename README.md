# Hearth 🏡

Home asset & maintenance tracker for `home.bruner.family`. Record what the
house is made of (roof, furnace, appliances), keep a maintenance log per
item, and see asset age against expected lifespan on a capital-planning
timeline.

Architecture is documented in
[ADR-001](docs/adrs/ADR-001-home-asset-tracker.md). The short version:

- **Expo + React Native Web** (Expo Router, TypeScript strict), exported as a
  fully static SPA — no app server. The same codebase later targets iOS.
- **Supabase Postgres** as the system of record, accessed directly from the
  client; **Row Level Security is the authorization model** (multi-tenancy by
  household).
- **Pocket-ID** as a Supabase custom OIDC provider — user provisioning is
  gated at the IdP; no public registration surface.
- **NativeWind v4** styling with semantic tokens; dark/light follows the
  system with a manual override.
- Hosted from a **GCS bucket** behind **Cloudflare**, deployed by GitHub
  Actions.
- **Notifications** are a weekly maintenance digest, sent by a pg_cron-scheduled
  Supabase Edge Function ([`supabase/functions/notify`](supabase/functions/notify))
  to Discord/Telegram, configured per-household in Settings. Secrets and cron
  setup are in [SETUP.md](docs/SETUP.md).
- **Find & filter** (v1.4): fuzzy search across name, brand, model, serial,
  location, and notes; filter by category, location, and lifespan age band; on
  laptop, a sortable table view and one-click CSV export of what you're
  viewing.
- **Reference details** (v1.5): a per-item key-value list (filter size, bulb
  type, paint code) shown on the item page and matched by search — the specs you
  need standing at the appliance.

## Development

```sh
cp .env.example .env        # fill in the Supabase project values
npm install
npm run web                 # dev server at http://localhost:8081
```

Other scripts: `npm run typecheck`, `npm run lint`,
`npm run build` (static export to `dist/`).

## Database

Schema, RLS policies, seed data, and storage policies live in
[`supabase/migrations/`](supabase/migrations) — the schema is code. Apply
with the Supabase CLI:

```sh
supabase link --project-ref <ref>
supabase db push
```

RLS policies are tested with pgTAP ([`supabase/tests/`](supabase/tests)):

```sh
supabase db start
supabase test db
```

## One-time setup

Supabase project, Pocket-ID OIDC client, GCP workload identity, Cloudflare,
and GitHub Actions secrets are walked through step by step in
[docs/SETUP.md](docs/SETUP.md).

## Deployment

`.github/workflows/deploy.yml` typechecks, lints, runs the pgTAP policy
tests, exports the static bundle, applies migrations, syncs `dist/` to the
GCS bucket (immutable hashed assets, short-TTL HTML), and purges the
Cloudflare cache. Required secrets are listed at the top of the workflow.

The bucket/Cloudflare need a SPA fallback (404 → `/index.html`) so
client-side routes like `/items/<id>` resolve on refresh.
