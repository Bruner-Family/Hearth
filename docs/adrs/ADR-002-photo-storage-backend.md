# ADR-002: Blob-Store Backend (GCS / S3 / R2) for Photo Attachments

|            |                                          |
|------------|------------------------------------------|
|**Status**  |Proposed                                  |
|**Date**    |2026-06-11                                |
|**Deciders**|Colin                                     |
|**Relates** |ADR-001 §2.4 (attachments via Supabase Storage)|

-----

## 1. Context

ADR-001 put receipt photos and manuals in **Supabase Storage** with
per-household path prefixes and Storage RLS mirroring the table policies.
That was chosen for one reason: it keeps authorization in a single place
(RLS) with zero extra moving parts, which matters for a serverless static
SPA.

The concern now is **cost**. Photos are by far the largest data this app
stores — the Postgres rows themselves are trivial. Raw blob storage (GCS,
S3, Cloudflare R2) is priced at commodity rates, while Supabase Storage is
priced as part of the platform plan:

| Backend | Storage $/GB-mo | Egress | Notes |
|---|---|---|---|
| Supabase Free | 1 GB cap | 5 GB/mo cap | Hard caps, not overage |
| Supabase Pro | $0.021 (100 GB incl.) | $0.09/GB (250 GB incl.) | **Requires the $25/mo plan** |
| GCS Standard | ~$0.020 | ~$0.12/GB | Already host the static bundle here |
| AWS S3 Standard | ~$0.023 | $0.09/GB (100 GB/mo free) | New cloud account for this project |
| Cloudflare R2 | $0.015 | **$0** | S3-compatible API; 10 GB + generous ops free tier; already behind Cloudflare |

(Prices as of writing — re-verify before deciding.)

The real cost cliff is not the per-GB rate: it's that photo growth past 1 GB
is the single most likely thing to force the project off the Supabase free
tier onto **Pro at $25/mo (~$300/yr)**, when the equivalent blob storage
would cost cents. At "low double-digit users × receipt photos," expect
single-digit GB for years — so this ADR is about *avoiding the plan
upgrade*, not about per-GB arithmetic.

## 2. The architectural problem: authorization without a server

Supabase Storage is the only blob option where access control is free
(Storage RLS rides on the existing session). Any external blob store needs
something to answer "may this user read/write this object?" — and ADR-001's
core constraint is **no application server**.

Serverless-compatible options:

1. **Supabase Edge Function mints presigned URLs.** Client calls an Edge
   Function with its Supabase JWT; the function checks household membership
   (same `is_household_member` logic, via service-role query), then returns
   a short-lived presigned GET/PUT URL for GCS (V4 signed URL) or
   S3/R2 (presigned request). Free tier includes 500K invocations/mo.
   Keeps all auth logic inside the Supabase project; works with any backend.
2. **Cloudflare Worker in front of R2.** Worker verifies the Supabase JWT
   (JWKS), extracts `household_id` from the object path, checks membership
   (cached PostgREST lookup or a custom JWT claim), and proxies/signs R2
   access. Workers free tier is 100K req/day; R2→Worker traffic is free.
   This is the most "already in our stack" shape, since Cloudflare fronts
   the site today.
3. **Unguessable public URLs (UUID paths, no auth).** Rejected: receipts
   contain addresses and card fragments; security-by-obscurity is not an
   access model we'd accept anywhere else in this app.

Either viable option **breaks the single-authorization-model property** that
ADR-001 called out as a positive: household-membership logic gets a second
implementation that must be kept in sync with the SQL policies, plus signing
code that needs its own tests. That is the real price of the migration —
not the engineering of the bucket itself.

## 3. Options

### Option A — Stay on Supabase Storage (status quo)

- ✅ Zero new components; Storage RLS already written and pgTAP-tested.
- ✅ Free until 1 GB, which may be years away.
- ❌ Crossing 1 GB costs $25/mo for the whole plan, not $0.02/GB.

### Option B — Cloudflare R2 + Worker (or R2 via Edge Function presigning)

- ✅ Cheapest at every scale: $0.015/GB-mo, **zero egress**, 10 GB free —
  realistically $0/mo for this app's lifetime.
- ✅ S3-compatible API; Cloudflare account and DNS already in use.
- ✅ Photo serving never touches Supabase egress caps.
- ❌ Second authorization implementation (Worker or Edge Function) to write,
  test, and keep in sync with RLS.

### Option C — GCS + Edge Function presigning

- ✅ Same cloud as the static-site bucket; existing workload-identity setup
  in CI extends naturally.
- ❌ Egress ~$0.12/GB (photos are read-heavy: every item detail view loads
  thumbnails), and GCS is not on Cloudflare's free-egress path.
- ❌ V4 URL signing from an Edge Function requires shipping a GCP service
  account key into Supabase secrets.

### Option D — AWS S3 + Edge Function presigning

- ❌ Introduces a third cloud provider for no advantage over B or C.
  Mentioned only because "S3" was the prompt; R2 *is* the S3 API without
  the egress bill.

## 4. Recommendation (proposed, not yet accepted)

**Option B (R2), but not yet.** Concretely:

1. **Now:** keep Supabase Storage. We are nowhere near 1 GB, the RLS
   integration is already built and tested, and migrating today buys
   nothing.
2. **Now:** keep the schema migration-friendly — `attachments.storage_path`
   is already a backend-agnostic path string, and all client access should
   stay behind a single helper (e.g. `getAttachmentUrl()` /
   `uploadAttachment()` in `src/lib/`) so the backend can be swapped in one
   module.
3. **Trigger to revisit:** when Storage usage passes ~700 MB (alert via the
   Supabase dashboard), or if a Pro upgrade is being considered for any
   other reason, execute the R2 migration: Worker (JWT-verified presigning),
   copy objects with `rclone`, rewrite `storage_path` prefixes in one
   migration, delete the Supabase bucket.

This converts the decision from "migrate for hypothetical savings" into a
cheap option we exercise exactly when the $300/yr cliff becomes real.

## 5. Open questions

1. Worker vs. Edge Function for presigning — Worker is closer to the
   existing Cloudflare setup; Edge Function keeps auth logic in Supabase.
   Decide at migration time based on which JWT-verification path is simpler
   then.
2. Image resizing/thumbnails: Supabase Pro includes image transformation;
   on R2 we'd pair Cloudflare Image Resizing or pre-generate thumbnails
   client-side at upload (likely sufficient — phone photos should be
   downscaled before upload anyway to save storage).
3. Does the future native iOS app change anything? (No obvious blocker:
   presigned URLs work identically from native.)
