# ADR-003 — Notifications: pg_cron + Edge Function fan-out

|            |                                   |
|------------|-----------------------------------|
|**Status**  |Accepted                           |
|**Date**    |2026-06-13                         |
|**Relates** |ADR-001 (architecture), roadmap §3 v1.3|

## Context

v1.3 delivers a weekly maintenance digest without an app server, honoring
ADR-001's "serverless stays serverless."

## Decision

- **One Supabase Edge Function** (`notify`, Deno) is the only new runtime.
- **pg_cron** triggers it weekly (Mondays 13:00 UTC) via **pg_net**, reading
  the function URL and a shared `cron_secret` from **Supabase Vault** so no
  secrets are committed. The schedule lives in `supabase/cron/
  weekly-notifications.sql`, run once in prod (kept out of migrations so the
  local/CI pgTAP image, which may lack pg_cron, still resets cleanly).
- **Due-detection is a single SQL function** (`notifications_digest`) so the
  server derives from the same tables the dashboard does — no duplicate rules.
- **Webhook-only** for v1.3 (Discord + Telegram); email (Resend) is a future
  channel on the same `notification_settings` row.
- **Weekly digest, no sent-ledger.** A standing condition reappears weekly.
  Future upgrade to daily + a `notifications_sent` ledger is additive.

## Consequences

- First server-side code in the repo; CI gains a `deno check` job and a
  `supabase functions deploy` step.
- Function files are excluded from the app's tsconfig/eslint (Deno globals).
- `notification_settings` is member-readable but owner-writable; webhook URLs
  and the Telegram bot token are therefore readable by any household member
  (a bearer-credential exposure within the household trust boundary). Accepted
  for v1.3; a future hardening could move tokens to Vault or an owner-only view.
- A daily cadence or per-user preferences would require the ledger and a
  schema change; deferred (spec: not in v1.3).
