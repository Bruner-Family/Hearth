# ADR-001: Home Asset & Maintenance Tracker (“Hearth”)

|            |                                         |
|------------|-----------------------------------------|
|**Status**  |Accepted                                 |
|**Date**    |2026-06-10                               |
|**Deciders**|Colin                                    |
|**Domain**  |home.bruner.family                       |
|**Audience**|Friends & family (low double-digit users)|

-----

## 1. Context

Homeowners accumulate significant capital assets — roofs, HVAC systems, appliances, irrigation — with no durable record of when they were purchased, what they cost, where they came from, or what maintenance has been performed. This information matters at warranty-claim time, at resale, when budgeting for replacements, and when deciding whether to repair or replace an aging item.

We want a small, self-service web application that lets a household:

1. Record home assets (purchase date, price, vendor, location in home, notes).
1. Attach an ongoing maintenance log to each asset (date, cost, notes, who performed it).
1. Visualize asset age against expected lifespan — a timeline showing, e.g., that the roof is 12 years into an expected 20, with the suggested lifespan editable per item.

Constraints driving this decision:

- **React Native** codebase to preserve a future iPhone app path (the iOS app itself is out of scope).
- **Fully client-side**, served as static assets from an S3/GCS bucket — no application server to operate.
- **Pocket-ID** (already operated as the household OIDC IdP) handles authentication and implicit user creation.
- **Supabase Postgres** as the system of record, with auth federated from Pocket-ID.
- Modern UI with graceful **dark/light mode**.
- Mobile-browser-first ergonomics, since most data entry happens standing in front of the appliance.

## 2. Decision

### 2.1 Application framework: Expo + React Native Web, static export

We will build the app with **Expo (SDK 53+)** using **React Native** components, **Expo Router** for file-based navigation, and **React Native Web** to target browsers. `npx expo export --platform web` produces a fully static SPA bundle (HTML/JS/CSS) that we upload to the bucket — no server-side rendering, no Node runtime.

This is the load-bearing decision: it satisfies “written in React Native” and “static bucket hosting” simultaneously. The same component tree, navigation, and business logic later compile to a native iOS app by adding an `ios` build target; only platform-specific polish would remain.

- **Language:** TypeScript, strict mode.
- **Navigation:** Expo Router (URL-based on web, which also gives us shareable deep links like `/items/<id>`; the same routes become native deep links later).
- **State/data fetching:** TanStack Query over `supabase-js`. No global state library; server state is the state.
- **Forms/validation:** `react-hook-form` + `zod` schemas shared between forms and any future tooling.

### 2.2 Hosting & delivery

- Static bundle in a **GCS bucket** (consistent with existing static-site experience), fronted by **Cloudflare** for TLS, caching, and the `home.bruner.family` DNS record.
- SPA fallback: Cloudflare rule (or bucket 404 → `index.html`) so client-side routes resolve on refresh.
- CI: GitHub Actions — typecheck, lint, `expo export`, sync to bucket, purge Cloudflare cache. Immutable, content-hashed asset filenames; only `index.html` is short-TTL.
- Cloudflare Access is **not** layered in front; authentication is in-app (below), and Access would break the OAuth redirect dance for the future native app.

### 2.3 Authentication: Pocket-ID as a Supabase Custom OIDC Provider

Supabase Auth now supports **custom OIDC providers**: you supply the issuer URL and client credentials, and Supabase resolves the discovery document, endpoints, and JWKS automatically from `{issuer}/.well-known/openid-configuration`, verifying ID tokens against the provider’s JWKS. Pocket-ID exposes a standard OIDC discovery document, so it slots in directly.

Flow:

1. Register the app as an OIDC client in Pocket-ID (authorization code + PKCE; redirect URI = Supabase callback).
1. Configure `custom:pocket-id` in Supabase (Dashboard → Authentication → Sign In/Providers → Custom Providers).
1. The client calls `supabase.auth.signInWithOAuth({ provider: 'custom:pocket-id' })` — identical code path to built-in providers.
1. On first sign-in Supabase **auto-creates the user**, mints its own JWTs, and manages refresh-token sessions. RLS, Storage, and Realtime all work with no special handling.

Properties we get for free:

- **User provisioning is gated at the IdP.** Only people Colin creates in Pocket-ID can ever sign in — exactly the right access-control point for a friends-and-family app. No public registration surface exists.
- **No secrets in the client.** PKCE flow; the Supabase publishable key is safe to ship in a static bundle because RLS is the enforcement boundary.
- The same `signInWithOAuth` call works in the future native app (Pocket-ID/Supabase handle multiple client IDs via `acceptable_client_ids`).

*Alternative considered:* Supabase **Third-Party Auth** mode, where Supabase validates Pocket-ID’s own JWTs via JWKS and never mints its own. Rejected: it leaves session/refresh management to us, bills per third-party MAU, and offers no benefit here since we’re happy to let Supabase own sessions.

### 2.4 Data layer: Supabase Postgres, client-direct with RLS

No API tier. The static client talks to Supabase over `supabase-js` (PostgREST), and **Row Level Security is the authorization model**. This is the architecture Supabase is designed for and the only one compatible with “no server.”

**Multi-tenancy model — households, not users.** A home is shared (spouses both log maintenance), and friends/family each get their own household. So:

```
households            (id, name, created_by, created_at)
household_members     (household_id, user_id, role ['owner','member'], created_at)
item_categories       (id, name, icon, default_lifespan_years, sort_order)   -- global, seeded, read-only to users
items                 (id, household_id, category_id, name, location,        -- e.g. "Kitchen", "Attic"
                       purchase_date, price_cents, vendor,                   -- money is integer cents, USD
                       brand, model, serial_number, warranty_until,
                       lifespan_years_override numeric NULL,                 -- user's edit of the suggested value
                       notes, created_by, created_at, updated_at)
maintenance_logs      (id, item_id, performed_on, cost_cents, performed_by,  -- "self", "ABC Plumbing"
                       notes, created_by, created_at)
attachments           (id, item_id, maintenance_log_id NULL,                 -- receipts, manuals, photos
                       storage_path, mime_type, created_by, created_at)
household_invites     (id, household_id, email, invited_by, status
                       ['pending','accepted','revoked'], expires_at, created_at)
```

**Invites without a server.** Sharing works by email invite, kept entirely inside Postgres: an owner inserts a row into `household_invites`; an RLS policy lets a signed-in user `select` invites where `email = auth.jwt()->>'email'` (Pocket-ID supplies a verified email claim); acceptance happens through a `security definer` RPC `accept_invite(invite_id)` that re-validates the email match and expiry, inserts the `household_members` row, and flips the invite to `accepted`. The client surfaces pending invites on login. No email is actually sent in v1 — “tell your spouse to log in” is sufficient at this scale, and an n8n notification hook can be bolted on later.

RLS policy shape (every tenant table): membership in the row’s household, resolved through a `security definer` helper to avoid recursive policy evaluation:

```sql
create function private.is_household_member(hid uuid)
returns boolean language sql security definer stable as $$
  select exists (select 1 from household_members
                 where household_id = hid and user_id = auth.uid());
$$;

create policy items_rw on items
  for all using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));
```

`maintenance_logs` and `attachments` derive household membership through their parent item. A `before insert` trigger creates a default household + owner membership on first login (keyed off `auth.users` insert), so onboarding is zero-touch. Money is stored as integer cents (USD only — see §5); all timestamps `timestamptz`.

**Migrations** live in the repo and apply via Supabase CLI in CI — the schema is code, same GitOps posture as the rest of the homelab.

**Attachments (confirmed in scope for v1)** — receipt photos, manuals — use Supabase Storage with a per-household path prefix (`/{household_id}/...`) and Storage RLS mirroring the table policies. Phone camera → receipt photo is the killer convenience for this app’s data-entry story.

### 2.5 Lifespan model & timeline visualization

A seeded `item_categories` table carries the suggested lifespan; the per-item `lifespan_years_override` lets users adjust (“our builder-grade dishwasher won’t see 10 years”). Effective lifespan = `coalesce(override, category default)`. Initial seed (editable, sourced from common industry estimates):

|Category              |Default (yrs)|Category          |Default (yrs)|
|----------------------|-------------|------------------|-------------|
|Roof (asphalt shingle)|20           |Dishwasher        |10           |
|HVAC – furnace        |18           |Refrigerator      |13           |
|HVAC – A/C condenser  |15           |Washer            |11           |
|Water heater (tank)   |11           |Dryer             |13           |
|Windows               |25           |Range/oven        |14           |
|Sprinkler/irrigation  |20           |Garage door opener|12           |
|Cabinets              |30           |Sump pump         |10           |

**Visualization:** a horizontal “remaining life” timeline — one bar per item, filled proportionally to `(today − purchase_date) / effective_lifespan`, color-shifting as items approach end-of-life, sorted by projected replacement date. This doubles as a capital-planning view (“what’s due in the next 5 years, and what did those items cost last time”). Rendered with **react-native-svg** (custom bars — works identically on web and native; avoids pulling in a heavy charting dependency for what is essentially styled rectangles). A secondary detail view per item shows cumulative maintenance spend over time.

### 2.6 UI, theming, and mobile ergonomics

- **Styling:** **NativeWind v4** (Tailwind syntax over RN styles) — design tokens defined once, applied across web and future native.
- **Dark/light:** follow system preference via `useColorScheme()`, with a manual override persisted in `localStorage`/AsyncStorage. Semantic color tokens (`bg-surface`, `text-primary`) rather than raw palette values so both themes are first-class, not an inverted afterthought.
- **Mobile-first layouts:** single-column forms, large touch targets, bottom-tab navigation (Items / Timeline / Settings) that maps 1:1 to a native tab bar later.
- PWA manifest + icons so the site is installable to a home screen — a cheap 80% of the “app feel” while the native build remains out of scope.

## 3. Consequences

**Positive**

- Zero servers to run or patch; total infra is a bucket, Cloudflare config, and a managed (or later self-hosted) Supabase project.
- One codebase from day one for web and a future iOS app; no rewrite risk embedded in the MVP.
- Authorization lives in one place (RLS + Storage policies), reviewable as SQL in the repo.
- User access is administered entirely in Pocket-ID, which the household already operates.

**Negative / accepted risks**

- React Native Web bundles are heavier than a lean React+Vite SPA, and some web-only libraries are unusable. Accepted: the iOS option is the point.
- RLS becomes the *only* enforcement layer — policies need tests (pgTAP or Supabase’s policy test harness in CI) because a policy bug is a data-exposure bug.
- Coupling to Supabase Auth/PostgREST. Mitigated: Supabase is open source and self-hostable, and the schema is plain Postgres; worst case, the data walks away in a `pg_dump`. (Note: verify custom-OIDC-provider parity on self-hosted Supabase before ever migrating off the hosted platform.)
- Pocket-ID is a homelab-hosted dependency on the sign-in path; if it’s down, nobody logs in (existing sessions survive via Supabase refresh tokens).

## 4. Alternatives considered

1. **React (Vite) + plain web, defer RN until the iOS app is real.** Lighter and simpler today; rejected because it guarantees a second codebase later and the stated requirement is RN-first.
1. **Supabase Third-Party Auth (validate Pocket-ID JWTs directly).** Rejected per §2.3 — more client-side session plumbing, per-MAU pricing, no upside at this scale.
1. **Thin Go API in front of Postgres.** Idiomatic for our work systems, but it reintroduces a server, contradicting the static-hosting constraint; RLS-direct is sufficient for this trust model.
1. **SQLite/local-first (e.g., PowerSync/ElectricSQL).** Attractive offline story, but adds sync complexity disproportionate to an app whose writes are occasional and whose users are online.

## 5. Resolved questions & future work

1. **Reminders — deferred, direction chosen.** End-of-life and recurring-maintenance notifications (e.g., “HVAC filter every 90 days”) are desired but out of scope for v1. **Follow-up:** investigate **Supabase Database Webhooks** (pg_net triggers firing on table changes) and **scheduled Edge Functions / pg_cron** as the mechanism — a nightly job scanning `items` for approaching `purchase_date + effective_lifespan` and posting to a notification channel keeps this server-free and inside the Supabase platform. Tracked as a candidate ADR-003 (ADR-002 became the photo-storage-backend proposal).
1. **Multi-currency — resolved: USD only.** All monetary values are integer cents, implicitly USD. The `currency` column is dropped from the v1 schema to avoid carrying dead weight; reintroducing it is a trivial additive migration if ever needed.

*Resolved during review:* household sharing is **in-app invite by email** (§2.4, invites flow); receipt/manual **attachments are in v1** (§2.4, Storage).
