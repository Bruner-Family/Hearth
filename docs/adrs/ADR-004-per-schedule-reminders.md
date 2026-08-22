# ADR-004: Per-schedule reminders, retriggering, and snoozing

|            |                                                   |
|------------|---------------------------------------------------|
|**Status**  |Accepted                                           |
|**Date**    |2026-08-17                                         |
|**Deciders**|Colin                                              |
|**Relates** |[ADR-003](ADR-003-notifications.md), [iOS readiness P2](../IOS-READINESS-TODO.md#p2-mobile-first-product-enhancements)|

## 1. Context

ADR-003 introduced a quiet weekly household digest. A Monday `pg_cron` job
invokes the `notify` Edge Function, which calls `notifications_digest` with
the household's `lead_time_days` and sends one combined message over its
enabled Discord and Telegram channels.

That model is intentionally stateless. An eligible condition appears in every
weekly digest, but Hearth does not record which condition was sent, when it
was sent, or whether the destination accepted it. It also provides no way to
snooze one schedule. The lead window and delivery frequency apply to the
whole household rather than to an individual maintenance schedule.

We now want each maintenance schedule to support a rule such as:

> Start reminding me 7 days before this task is due. Repeat daily until I
> snooze it or complete it.

The repeat choices for this phase are hourly, daily, and weekly. Completion
ends reminders for the current occurrence. Because schedules recur,
completion advances `next_due` and creates a future occurrence that will
become eligible under the same reminder rule.

This ADR covers household alerts delivered through the household's enabled
channels. It does not introduce per-user recipients or iOS push tokens.

## 2. Decision

Keep ADR-003's Supabase `pg_cron` plus Edge Function delivery architecture,
but replace its stateless handling of maintenance schedules with a
server-owned reminder state machine and delivery ledger.

The existing weekly digest remains available for warranties and end-of-life
notices. Maintenance schedules move out of that digest when the new reminder
worker is enabled, preventing duplicate schedule messages.

### 2.1 Configuration ownership

Configuration is split across two levels:

- `notification_settings` remains the household delivery configuration. It
  owns the enabled channels, credentials, household time zone, preferred
  reminder time, and the weekly non-schedule digest setting. Only a household
  owner may change channel configuration.
- `maintenance_schedules` owns the reminder behavior for one task. Household
  members who may edit a schedule may also edit its reminder rule.

Add these client-managed fields to `maintenance_schedules`:

| Field | Meaning |
|---|---|
| `reminder_enabled boolean` | Whether the schedule produces reminders. |
| `reminder_lead_days integer` | How many calendar days before `next_due` the occurrence becomes eligible. Zero means the due day. |
| `reminder_frequency reminder_frequency` | `hourly`, `daily`, or `weekly`. |

`reminder_lead_days` is constrained to `0..365`. Existing schedules are
backfilled from their household's current `lead_time_days`, falling back to
14, and use `weekly` frequency so the migration preserves the existing weekly
repeat rate. It does not preserve the legacy Monday 13:00 UTC delivery
instant: each schedule re-anchors to its own lead boundary at the household's
`reminder_time`, so a migrated schedule can change day of week and time of
day. New schedules default to enabled, 14 days, and weekly unless the user
chooses otherwise.

Add these owner-managed fields to `notification_settings`:

| Field | Meaning |
|---|---|
| `time_zone text` | IANA time zone used to interpret due days and daily delivery. Not null, defaults to `UTC` for existing rows. |
| `reminder_time time` | Local time at which a due-day reminder window starts and daily or weekly reminders are delivered. Not null, defaults to `09:00`. |
| `weekly_digest_enabled boolean` | Whether warranties and end-of-life notices remain in the quiet Monday digest. Not null, defaults to true. |

The application must offer valid IANA time zones. The database must also
reject unknown values rather than trusting an arbitrary client string.

The existing `notification_settings.enabled` flag stays the household master
switch and gates both cron modes: when it is false the household produces no
per-schedule reminders and no weekly digest, regardless of any schedule's
`reminder_enabled`. `weekly_digest_enabled` only gates the Monday warranty and
end-of-life digest and has no effect on per-schedule reminders. A household
with no `notification_settings` row has no configured channels and therefore
no reminders.

The existing household `lead_time_days` remains the lead window for warranty
and end-of-life digest entries. It is also the initial default presented when
creating a schedule, but changing it does not rewrite existing per-schedule
rules.

### 2.2 Time semantics

`next_due` remains a `date`. Maintenance tasks generally have a meaningful
due day, not an exact due instant. The first eligible instant is:

```text
(next_due - reminder_lead_days) at notification_settings.reminder_time
in notification_settings.time_zone
```

If `reminder_time` does not exist on that local day because of a
daylight-saving gap, the first eligible instant is the first valid instant
after the gap. If it occurs twice because of a fall-back, the earlier
occurrence is used.

The hourly worker may deliver up to one cron interval after that instant.

Slots are a grid derived only from current state, never from delivery
history, so any worker computes the same `slot_at` for the same schedule. The
grid anchor is the later of the first eligible instant and a `snoozed_until`
that has since passed (see §2.3), so a snooze set before the lead window opens
cannot pull the first reminder forward:

- `hourly` means one grid point every 60 minutes from the anchor, so no more
  than one successful delivery per elapsed 60-minute slot.
- `daily` means one grid point per local calendar day at or after
  `reminder_time`, so one successful delivery per local day.
- `weekly` means one grid point every seven local calendar days at or after
  `reminder_time`.

`slot_at` is the most recent grid point at or before `now()`.

An overdue occurrence remains eligible until it is completed, snoozed,
disabled, deleted, or its due date changes. Hourly reminders continue
overnight in this phase because that is the explicit cadence selected by the
user. Quiet hours may be added later as a separate preference.

### 2.3 Snooze state

Add `snoozed_until timestamptz` to `maintenance_schedules`. It is server-owned:
clients change it through a `snooze_schedule(schedule_id, snooze_days)` RPC,
not through a direct column grant. The RPC takes a day count rather than an
instant so the household time zone, the reminder time, and the DST rules that
resolve them stay in one implementation.

The RPC must:

1. Require an authenticated household member.
2. Lock and validate the schedule without revealing foreign rows.
3. Require between 1 and 365 days. Longer suppression uses reminder
   disablement or the future pause feature.
4. Accept an explicit null to clear a snooze, so a member can un-snooze a
   schedule without completing it, disabling reminders, or editing `next_due`.
5. Resolve the day count to the reminder time in the household time zone and
   update `snoozed_until` atomically.

While `snoozed_until > now()`, the occurrence is ineligible. Once the snooze
timestamp has passed, it becomes the grid anchor from §2.2 unless it precedes
the first eligible instant, in which case the lead boundary still anchors the
grid. Clearing a snooze restores the first eligible instant as the anchor.

Changing `next_due` clears `snoozed_until`. `complete_schedule` also clears it
in the same transaction that advances `next_due`. This prevents a snooze for
an old occurrence from suppressing the next occurrence.

The sender revalidates a claim immediately before contacting a provider.
Snoozing cancels outstanding, undelivered claims. A provider request already
in flight may still arrive, which is the same unavoidable external-delivery
race accepted for completion.

### 2.4 Delivery ledger and claiming

Create a service-role-only `schedule_notification_deliveries` table. At
minimum, each row records:

| Field | Meaning |
|---|---|
| `id` | Delivery claim identifier. |
| `schedule_id` | Schedule being reported; cascades on deletion, so deleting a schedule intentionally discards its delivery history. |
| `occurrence_due_on` | Snapshot of `next_due` for the occurrence. |
| `channel` | Discord, Telegram, or a future channel. |
| `slot_at` | Canonical hourly, daily, or weekly delivery slot. |
| `status` | `claimed`, `delivered`, `failed`, or `cancelled`. |
| `claimed_at` / `delivered_at` | Claim and successful-delivery timestamps. |
| `attempt_count` / `last_error` | Retry diagnostics without message content or credentials. |

A unique constraint on `(schedule_id, occurrence_due_on, channel, slot_at)`
prevents two workers from claiming the same delivery slot. A separate partial
unique index on `(schedule_id, occurrence_due_on, channel)` restricted to
unresolved statuses enforces the single-outstanding-claim rule below; the
four-column constraint alone cannot express it. Authenticated clients receive
no direct table privileges. Operational errors must not store webhook URLs,
Telegram tokens, schedule notes, or other household content.

A service-role database function claims eligible rows transactionally with a
bounded batch size. It uses row locking and conflict-safe inserts, then returns
only the claims won by that invocation. A conflicting row in a resolved
non-terminal state is re-claimed rather than skipped: a `cancelled` row left by
a snooze or completion, and a `failed` row still within its retry budget, must
not permanently block their slot. A `delivered` row always blocks its slot.
The Edge Function groups claims by household and channel, sends a compact
reminder message, and marks every claim delivered or failed.

Only one unresolved claim may exist for a schedule, occurrence, and channel.
A failed slot is retried or abandoned before a newer cadence slot is claimed,
preventing a provider outage from releasing a backlog of stale messages at
once.

Webhook delivery is not exactly-once. If a provider accepts a message and the
worker crashes before recording success, a lease-expiry retry can create a
duplicate. We accept rare duplicates in this ambiguous failure case in favor
of eventually delivering the reminder. Normal concurrent cron executions do
not duplicate a slot.

The sender must treat a request as successful only when `fetch` completes and
the provider returns an accepted HTTP status. Network failures, rate limits,
and HTTP errors are recorded distinctly. Transient failures receive bounded
backoff retries; permanent authorization or configuration failures stop
retrying that channel and surface a configuration error to the household
owner.

Delivery diagnostics are retained for 90 days and then removed by a scheduled
cleanup job. Eligibility and deduplication must depend only on unexpired
current state and recent slots so cleanup cannot reactivate an old occurrence.

### 2.5 Worker and cron modes

Keep one `notify` Edge Function with explicit cron modes:

- An hourly `schedule-reminders` invocation claims and sends eligible
  per-schedule reminders.
- The existing Monday `weekly-digest` invocation sends warranty and
  end-of-life notices only.
- Owner-authenticated test mode continues to validate configured channels.

The cron secret remains in Supabase Vault and function secrets as specified by
ADR-003. Cron mode is selected by a server-controlled request body, not by an
unauthenticated client request. The existing job in
`supabase/cron/weekly-notifications.sql` posts an empty body, so a missing
mode must keep meaning `weekly-digest`; the job is updated to send the mode
explicitly and a second job is added for the hourly `schedule-reminders`
invocation.

Messages use cadence-neutral wording such as "Hearth reminders" instead of
"this week in Hearth." When an application URL is available, each scheduled
task links to an authenticated screen where a member can snooze or complete
it. Discord and Telegram remain outbound-only integrations; this ADR does not
add unauthenticated webhook action handlers.

### 2.6 Completion and concurrent changes

`complete_schedule` remains the authoritative completion operation. In one
transaction it must:

1. Write the maintenance log where applicable.
2. Advance `next_due` and set `last_completed_on`.
3. Clear `snoozed_until`.
4. Cancel outstanding, undelivered claims for the completed occurrence.

Old delivery rows remain as operational history and cannot suppress the new
occurrence because their `occurrence_due_on` differs. Because `next_due` is
client-writable, a member who edits it back to a previously notified date
reuses that occurrence key and its `delivered` rows suppress the already-sent
slots. Changing `next_due` therefore also cancels outstanding claims, and the
residual suppression of already-delivered slots for a restored date is an
accepted edge case rather than a separate occurrence identifier.

The claim function and completion RPC both lock the schedule before changing
its reminder state. A notification already handed to an external provider may
still arrive just after another member completes the task. Avoiding that final
race is impossible without provider-side cancellation, so it is an accepted
edge case.

### 2.7 Recipient scope

Per-schedule settings determine what the household is reminded about. They do
not determine which household member receives it. Every eligible reminder is
sent to the household channels enabled in `notification_settings`.

Per-user preferences require a separate subscription model keyed by user and
schedule or reminder kind, plus one or more push tokens per user. That work
remains part of the iOS notification roadmap and can consume the same claimed
reminder events later.

## 3. Rollout

Roll out without a duplicate or missing-notification window:

1. Add the schedule configuration, time-zone configuration, snooze state,
   ledger, indexes, RPCs, and grants. Backfill existing schedules to weekly.
   Add the three new schedule columns to the `authenticated` insert and update
   column grants; `snoozed_until` gets no client grant.
2. Deploy the `notify` function with both legacy and new modes. Fix delivery
   accounting so non-2xx provider responses are failures.
3. Add schedule reminder fields and snooze actions to the application. Display
   the effective household time zone and clearly warn that hourly means every
   hour until action is taken.
4. In one production rollout, remove schedules from `notifications_digest`,
   seed a weekly baseline for already-eligible occurrences, and enable the
   hourly reminder cron job. The baseline is seeded at cutover, not earlier:
   the legacy Monday digest keeps sending schedule entries until this step, so
   a baseline seeded in step 1 would have aged out and the first hourly run
   would repeat a digest sent days before.
5. Observe claim backlog, failures, provider rate limits, and duplicate rate
   before making hourly reminders broadly available.

The restore runbook must include the delivery ledger. Restoring old claims
must not cause a burst of stale messages; reminder delivery remains disabled
during restore until occurrence state and cron configuration are verified.

## 4. Testing requirements

Database and function tests must cover:

- Tenant isolation and direct-write rejection for snooze and delivery state.
- Initial eligibility before, at, and after the lead boundary.
- Hourly, daily, and weekly slot calculation in multiple time zones and across
  daylight-saving transitions.
- Snooze before the first reminder, snooze after delivery, and expiry.
- Completion, direct due-date edits, disablement, and deletion.
- Concurrent claim invocations and the unique delivery constraint.
- A completion racing with a claim.
- Independent results when one household or one channel fails.
- HTTP success, rate limiting, client errors, server errors, timeouts, and
  lease-expiry retry.
- Un-snoozing, and re-claiming a slot whose previous claim was cancelled.
- `notification_settings.enabled` false suppressing both cron modes.
- Migration defaults that preserve the existing weekly repeat rate.
- No duplicate schedule entry in the weekly warranty/end-of-life digest.

## 5. Consequences

### Positive

- Each task can match its actual urgency without making every household alert
  noisy.
- Snooze and completion have server-authoritative behavior across devices and
  household members.
- The ledger makes retries, diagnostics, and future push delivery possible.
- The design remains serverless and reuses the existing Supabase runtime.

### Negative

- Notification delivery gains durable mutable state, cleanup requirements,
  retry policy, and more operational monitoring.
- Hourly execution increases Edge Function calls and webhook traffic.
- Exactly-once external delivery remains impossible.
- Date-only schedules require a household time zone and preferred time to
  produce deterministic reminder instants.
- Per-user preferences are still a separate feature.

## 6. Alternatives considered

### Run the existing digest every hour

Rejected. It would resend every eligible schedule each hour, provide no
snooze or delivery history, and multiply warranty and end-of-life messages.

### Store only `last_notified_at` on the schedule

Rejected. One timestamp cannot independently track multiple channels,
occurrences, retries, or concurrent claims, and it loses the history needed to
diagnose delivery.

### Schedule local notifications on each device

Rejected as the authoritative mechanism. A local device does not reliably
observe another member's completion or snooze, and reminders disappear when
the app is removed, permissions change, or the device is replaced. Local
notifications may later supplement the server-owned state.

### Replace the weekly digest entirely

Rejected. Warranty and end-of-life notices remain low-urgency household
signals that fit a quiet weekly summary and do not currently have completion
or snooze semantics.
