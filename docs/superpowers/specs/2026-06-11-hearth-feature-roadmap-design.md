# Hearth Feature Roadmap — Design

|            |                                              |
|------------|----------------------------------------------|
|**Status**  |Approved (brainstorm 2026-06-11)              |
|**Date**    |2026-06-11                                    |
|**Deciders**|Colin                                         |
|**Relates** |ADR-001 (architecture), docs/TODO.md (backlog)|

## 1. Context & goal

Hearth v1 is live with a single active user (Colin). The core loop — record
items, log maintenance, attach photos — works, but the app gives no reason
to come back: no reminders, no insights, no pull. Secondary friction is
retrieval (no search or filters). Users reach the app from mobile browsers
first and laptop browsers occasionally; today every screen is a single
mobile-width column.

**The metric for every prioritization call in this roadmap is user
experience**: does the release make the app more useful and more pleasant to
use, on the phone first and the laptop honestly.

## 2. Roadmap shape & principles

Five themed releases, shipped strictly in order, each one fully finished
(implemented, tested, deployed) before the next starts. Each release has a
single user-facing theme a household member could understand.

Principles:

- **Dashboard-led** (chosen over "pull-first" and "polish-first"
  sequencing): make opening the app rewarding first, then give it reasons
  to pull you back, then push outward to notifications.
- **One system, no duplicate bookkeeping** — reminders, history, and
  insights all derive from the same tables; completing a task writes the
  same `maintenance_logs` row a manual entry would.
- **Serverless stays serverless** — everything here fits ADR-001's
  static-SPA + Supabase architecture; scheduled work uses pg_cron + Edge
  Functions, never an app server.
- **Quiet by default** — no notification, badge, or banner unless something
  actually needs attention.

## 3. Releases

### v1.1 — Home Worth Opening

**Theme:** a landing screen worth looking at, on both screen sizes.

- New **Home tab**, first in the tab bar, using the **Timeline Hero**
  layout (chosen in mockup review): the lifespan timeline leads the page —
  full-width on laptop, compact on phone — with summary cards below:
  - **Needs attention** — items near end-of-life, warranties expiring soon.
  - **Next 5 years** — projected replacements by year with last-known cost.
  - **Spend** — maintenance spend this year (chart on laptop).
  - **Recent activity** — latest log entries.
- The standalone **Timeline tab is absorbed** into Home; the tab bar stays
  at three: Home · Items · Settings.
- **Responsive scaling app-wide**, done once as a foundation: centered
  max-width content on laptop, items list becomes a card grid, forms go
  two-column where natural.
- **Data:** everything derives from existing tables — no schema changes.

**Not in v1.1:** schedules/reminders (v1.2), search (v1.4).

**Done when:** opening the app on a phone answers "what needs attention?"
in one glance, and the laptop layout uses the width instead of a centered
mobile column.

### v1.2 — Reasons to Return

**Theme:** the app starts pulling you back (in-app only; no infrastructure).

- New table **`maintenance_schedules`**: belongs to an item or standalone
  for house-level tasks ("test smoke detectors"); has a name, an interval
  (every N months) **or** a season anchor ("every October"), and a next-due
  date.
- **Completing a due task does two things in one tap:** writes a prefilled
  `maintenance_logs` entry (date, cost, notes) and advances next-due.
- **Seasonal checklists are schedules with season anchors**, not a separate
  system. A seeded starter pack (gutters, irrigation blow-out, filters,
  smoke-detector batteries) is offered per household; adopt or skip each.
- **UX surfaces:** item detail gains a "Schedule" section; the Home tab's
  Needs-attention card lists due and upcoming tasks with one-tap check-off;
  overdue tasks badge the Home tab icon.

**Not in v1.2:** notifications (v1.3), snooze/assignment mechanics — all
household members see the same due list.

**Done when:** filter changes and seasonal chores show up by themselves,
and checking one off takes a single tap plus an optional cost.

### v1.3 — Notifications

**Theme:** the due list reaches you without opening the app.

- **Mechanism:** a **weekly** pg_cron-scheduled Supabase **Edge Function**
  reads the same due/upcoming data the Home tab shows (schedules,
  end-of-life warnings, expiring warranties) — derived in one shared SQL
  function so the server path uses the same rules, not a copy — and fans out
  per household. (Revised 2026-06-13 from "daily": most signals are standing
  conditions, so a weekly digest is quieter without a per-item sent-ledger;
  see §4.)
- **Channels (v1.3):** **Discord and/or Telegram webhooks** — a single HTTP
  POST each; n8n is not required (can be slotted in later as just another
  webhook URL).
- **Email digest via Resend — deferred.** It needs a verified sending domain
  and an API key; webhooks are a single POST with no external account, so
  v1.3 ships webhook-only and email slots in later as another channel on the
  same `notification_settings` row.
- **Settings:** per-household `notification_settings` table — enabled on/off,
  Discord/Telegram webhook config, lead-time days. Cron/Edge secrets live in
  Supabase Edge Function secrets + Vault (no Resend key in v1.3).
- **Quiet by design:** nothing due → nothing sent.

**Not in v1.3:** email/Resend (deferred, above); a daily cadence + a
`notifications_sent` ledger (an additive future upgrade if weekly proves too
noisy); PWA web push; per-user notification preferences.

**Done when:** a filter coming due produces a Discord (or Telegram) ping
without Colin having opened Hearth that week.

### v1.4 — Find & Filter

**Theme:** retrieval — get to any item, serial, or manual in seconds; the
laptop earns power tools.

- **Search:** instant client-side fuzzy matching across name, brand, model,
  serial, location, and notes. The full household item list already sits in
  the TanStack Query cache, so there is no backend work at this scale.
- **Filters:** category, location, age bands.
- **Table view (laptop):** the Items tab gains a toggle to a sortable,
  dense table — the power-user surface.
- **CSV export:** generated client-side from the loaded data.

**Done when:** "what's the water heater's serial?" is answerable in under
ten seconds from a phone, and the laptop table can sort every item by age.

### v1.5 — At the Appliance

**Theme:** Hearth is useful standing in front of the equipment and at the
hardware store.

- **Reference details:** per-item key-value list ("Filter: 16×25×1",
  "Bulb: A19 60W", "Paint: SW 7029"), prominent on item detail and indexed
  by v1.4 search. Stored as a JSONB column on `items` — a handful of pairs
  per item doesn't justify a new table and its RLS policies.
- **Document attachments:** attach a PDF or scanned document (receipt,
  manual, warranty) to an item alongside photos, surfaced on item detail
  beside the reference details. The `attachments` table,
  `useUploadAttachment`, and the 📄 thumbnail fallback already handle
  arbitrary file types; the work is a document picker
  (`expo-document-picker`) plus file names on non-image thumbnails. Backlog:
  [docs/TODO.md](../../TODO.md). (Decided 2026-06-13 to land here rather than
  v1.4 — see §4.)
- **QR labels:** printable sheet of per-item QR codes deep-linking to the
  item page (Expo Router URLs already support `/items/<id>`); scanning at
  the furnace opens its history and log form.
- **CSV import:** desktop bulk-load of items from a spreadsheet with column
  mapping, for cataloging the rest of the house.

**Done when:** the filter size is two taps away in the store aisle, a sticker
on the furnace opens its Hearth page, and the appliance's manual is one tap
from there.

## 4. Decisions log

| Decision | Choice | Alternatives considered |
|---|---|---|
| Roadmap shape | Themed releases, strict order | Ordered backlog; Now/Next/Later |
| Sequencing | Dashboard-led (B) | Pull-first (A); polish-first (C) |
| Dashboard layout | Timeline Hero; absorbs Timeline tab | Card stack → grid; 4-tab bar |
| Reminder channels | In-app first, then email + Discord/Telegram | PWA web push (deferred) |
| Checklists model | Schedules with season anchors | Separate checklist system |
| Search | Client-side over cached data | Postgres full-text/trigram |
| Document attachments → v1.5 (2026-06-13) | "At the Appliance" — reference material in hand at the equipment | v1.4, whose theme names "manual" retrieval; a standalone quick win |
| v1.3 cadence (2026-06-13) | Weekly digest, no sent-ledger | Daily + per-item `notifications_sent` ledger (deferred as an additive upgrade); daily with no dedup (too noisy) |
| v1.3 channels (2026-06-13) | Webhook-only first (Discord/Telegram) | Email + webhooks together (Resend needs domain verification — deferred); webhooks are a no-account single POST |
| v1.4 search (2026-06-14) | Fuse.js fuzzy, multi-term AND, ranked | Hand-rolled substring matcher (no typo tolerance) |
| v1.4 age bands (2026-06-14) | Lifespan status (Healthy/Aging/Near-EOL/Unknown), reusing the 0.7/0.9 thresholds | Fixed year buckets (ignores expected lifespan) |
| v1.4 table & CSV (2026-06-14) | Web/laptop-only (≥768px); CSV exports the visible (searched+filtered) set | Table on phone too; export-all regardless of filters |
| v1.5 reference details (2026-06-14) | Ordered `{label,value}` JSONB array on `items`, searchable; blank rows dropped on save | Object map (loses order); separate table + RLS (overkill for a handful of pairs) |
| Custom emoji for "Other" items — incremental (2026-06-15) | Picking "Other" category reveals a curated emoji grid + free-entry field; choice stored in nullable `items.icon`, overrides 📦 default on list, detail, and weekly digest | Always showing the picker (noisy for non-Other items); storing a text label instead of an emoji |

Declined for now: faster-capture flow (photo-first add) — entry speed was
not the limiting pain.

v1.4's theme line ("get to any item, serial, or manual in seconds") names
manuals as a retrieval target, but attaching them is a v1.5 capability;
until v1.5 ships, that part of v1.4's promise is aspirational. Accepted —
the attachment work is small and fits v1.5's "at the appliance" theme best.

## 5. Out of scope for this roadmap

- Native iOS app (ADR-001 keeps the path open; nothing here closes it).
- Photo storage migration (ADR-002, triggers on storage growth).
- Multi-currency, public registration, per-user notification preferences.

## 6. Execution notes

Each release gets its own implementation plan (superpowers writing-plans)
when it starts; this document is the source of truth for scope and order.
Reprioritize between releases only — not mid-release. When household
members join (post-v1.2 is the natural moment), their feedback feeds the
next release boundary.
