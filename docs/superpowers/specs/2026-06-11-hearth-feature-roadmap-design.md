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

- **Mechanism:** daily pg_cron-scheduled Supabase **Edge Function** reads
  the same due/upcoming data the Home tab shows (schedules, end-of-life
  warnings, expiring warranties) and fans out per household.
- **Channels:**
  - **Email digest** via Resend (free tier is ample at this scale).
  - **Discord and/or Telegram webhooks** — a single HTTP POST each; n8n is
    not required (can be slotted in later as just another webhook URL).
- **Settings:** per-household `notification_settings` table — email on/off,
  webhook URLs, lead-time days. Secrets (Resend API key) live in Supabase
  Edge Function secrets.
- **Quiet by design:** nothing due → nothing sent.

**Not in v1.3:** PWA web push (revisit if email/webhooks prove
insufficient), per-user notification preferences.

**Done when:** a filter coming due produces a Discord ping and an email
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
- **QR labels:** printable sheet of per-item QR codes deep-linking to the
  item page (Expo Router URLs already support `/items/<id>`); scanning at
  the furnace opens its history and log form.
- **CSV import:** desktop bulk-load of items from a spreadsheet with column
  mapping, for cataloging the rest of the house.

**Done when:** the filter size is two taps away in the store aisle, and a
sticker on the furnace opens its Hearth page.

## 4. Decisions log

| Decision | Choice | Alternatives considered |
|---|---|---|
| Roadmap shape | Themed releases, strict order | Ordered backlog; Now/Next/Later |
| Sequencing | Dashboard-led (B) | Pull-first (A); polish-first (C) |
| Dashboard layout | Timeline Hero; absorbs Timeline tab | Card stack → grid; 4-tab bar |
| Reminder channels | In-app first, then email + Discord/Telegram | PWA web push (deferred) |
| Checklists model | Schedules with season anchors | Separate checklist system |
| Search | Client-side over cached data | Postgres full-text/trigram |

Declined for now: faster-capture flow (photo-first add) — entry speed was
not the limiting pain.

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
