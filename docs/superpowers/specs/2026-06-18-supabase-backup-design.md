# Supabase Backup (Free, Self-Managed) — Design

**Status:** Approved (design)
**Date:** 2026-06-18

## Problem

Hearth runs on Supabase's **free plan**, which performs **no automated
backups** — daily backups with retention start at the Pro plan ($25/mo). The
app is deployed and stable, so an accidental delete, bad migration, or project
loss would currently mean permanent data loss with no recovery point.

We want a free, self-managed backup that captures everything Hearth stores,
runs unattended, and has a proven restore path — without upgrading to Supabase
Pro.

## Goal

A nightly, off-site, self-managed backup of the production Supabase project
(Postgres **and** Storage), retained for 30 days, with a documented and
test-verified restore procedure.

## What Hearth stores (and where)

Data lives in two independent stores; a complete backup needs both:

1. **Postgres** — application tables (`public` schema) and the `auth` schema
   (`auth.users`, from Pocket-ID OIDC). Storage object *metadata* also lives in
   Postgres (`storage.objects`).
2. **Storage bucket** — the actual uploaded attachment files (receipts,
   photos). These are **not** in a Postgres dump; they must be copied
   separately.

## Decisions (locked during brainstorming)

| Decision | Choice |
| --- | --- |
| Scope | Postgres (incl. `auth`) **+** Storage files |
| Off-site destination | A **new, private GCS bucket** (separate from the public hosting bucket) |
| Schedule | **Daily** (nightly GitHub Actions cron) |
| Retention | **30 days** (GCS lifecycle rule) |
| Restore | **Documented runbook + a verified test restore** during implementation |
| DB dump tool | **Supabase CLI `db dump`** (roles + schema + data) |
| Storage copy tool | **AWS CLI `aws s3 sync`** against Supabase's S3 endpoint |

### Why these tool choices

- **Supabase CLI `db dump`** over raw `pg_dump`: it is Supabase's maintained
  pattern, emits separate `roles.sql` / `schema.sql` / `data.sql`, and handles
  Supabase-managed roles and the `auth` schema correctly.
- **AWS CLI** over `rclone`: `rclone` ≥ v1.68 moved to AWS SDK v2, which
  Supabase's S3 endpoint does not support. The AWS CLI (SigV4) works against
  the Supabase S3 endpoint without version pinning.
- **Session pooler, not direct connection**: GitHub Actions runners are
  IPv4-only; Supabase direct DB connections are IPv6. Dumps must connect
  through Supabase's **session-mode pooler** (Supavisor) so they work from CI.

## Architecture

A new scheduled GitHub Actions workflow runs nightly and on-demand. It:

1. Authenticates to GCP using the **existing Workload Identity Federation**
   (same mechanism as `deploy.yml`).
2. Dumps Postgres via the Supabase CLI through the session pooler →
   `roles.sql`, `schema.sql`, `data.sql`, each gzipped.
3. Copies the Storage bucket with `aws s3 sync` against the Supabase S3
   endpoint → `storage.tar.gz`.
4. Uploads all artifacts to `gs://<backups-bucket>/YYYY-MM-DD/`.

A GCS **lifecycle rule** on the backups bucket deletes objects older than 30
days. The bucket, its lifecycle rule, public-access prevention, and the
service-account IAM binding are provisioned **out of this repo** (see
Infrastructure prerequisites).

```
GitHub Actions (nightly cron, IPv4)
   │  Workload Identity → GCP
   ├─ supabase db dump (roles/schema/data) ──(session pooler, IPv6→Supavisor)──▶ *.sql.gz
   ├─ aws s3 sync (Supabase S3 endpoint) ───────────────────────────────────▶ storage.tar.gz
   └─ gcloud storage cp ────────────────────────────────────────────────────▶ gs://<backups-bucket>/<date>/
                                                                                  │
                                                          GCS lifecycle: delete > 30 days
```

## Components owned by THIS repo

- `.github/workflows/backup.yml` — schedule (`cron: "0 7 * * *"`, ~midnight US)
  plus `workflow_dispatch`. Installs the Supabase CLI and AWS CLI,
  authenticates to GCP via Workload Identity, runs the backup script.
- `scripts/backup/supabase-backup.sh` — all backup logic (kept out of YAML so
  it is readable and runnable locally): the three DB dumps, the Storage sync,
  integrity guards, and the GCS upload to a dated prefix.
- `docs/runbooks/restore-supabase.md` — the restore procedure (DB restore +
  Storage re-upload), written from and validated by the verified test restore.

## Infrastructure prerequisites (provisioned in the separate IaC repo)

These are **not** created by this repo. They are documented here as
requirements for the infrastructure-as-code repository to implement, and this
repo's workflow assumes they already exist:

1. A **new, private GCS bucket** dedicated to backups (e.g. `hearth-backups`),
   distinct from the public web-hosting bucket. Backups contain personal data
   (emails, household inventory) and must never share the world-readable
   hosting bucket.
2. **Public access prevention = enforced** and **uniform bucket-level access**
   on that bucket. Default Google-managed at-rest encryption is sufficient (no
   application-level GPG).
3. A **lifecycle rule** deleting objects older than **30 days**.
4. An **IAM binding** granting the existing deployer service account
   (`GCP_SERVICE_ACCOUNT`) object-admin (`roles/storage.objectAdmin`) **scoped
   to the backups bucket only**.

The implementation plan will include a short `scripts/backup/gcs-lifecycle.json`
reference copy of the intended lifecycle rule for documentation/parity, but the
authoritative definition lives in the IaC repo.

## Secrets

New repository secrets consumed by the workflow:

- `SUPABASE_DB_URL` — session-pooler connection string including the password.
- `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY`,
  `SUPABASE_S3_ENDPOINT` — Supabase Storage S3 credentials/endpoint.
- `GCS_BACKUP_BUCKET` — the private backups bucket name (no `gs://` prefix).

Reused from the existing deploy setup:
`GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`.

## Error handling & integrity

- The backup script fails the job if **any** dump file is missing or
  zero-length, or if a gzip integrity check (`gzip -t`) fails — a silently
  broken backup must not be reported as success.
- The Storage sync failing (network/credentials) fails the job.
- Failure visibility relies on **GitHub's built-in failed-scheduled-workflow
  emails** to the repo owner. No custom alerting (YAGNI); can be added later.

## Restore (verified)

The restore runbook covers:

1. **Database** — apply schema from migrations (`supabase db push`) into the
   target project, then load `data.sql` (which carries `public` and `auth`
   data); `roles.sql` for a from-scratch project.
2. **Storage** — re-upload `storage.tar.gz` contents to the target bucket via
   `aws s3 sync` to the Supabase S3 endpoint.

During implementation we **verify** the database restore by loading `data.sql`
into a local Postgres (`supabase start` stack) and asserting that key tables —
including `auth.users` — round-trip with expected row counts. The runbook is
written from that proven procedure.

## Out of scope

- Point-in-time recovery (Pro-only).
- Cross-region/redundant replication.
- Automated/one-click restore (restore stays a documented manual runbook).
- Provisioning the GCS bucket/IAM/lifecycle in this repo (owned by the IaC
  repo).
- Custom failure alerting beyond GitHub's default emails.

## Success criteria

- A nightly run produces `roles.sql.gz`, `schema.sql.gz`, `data.sql.gz`, and
  `storage.tar.gz` under `gs://<backups-bucket>/<date>/`.
- Backups older than 30 days are auto-deleted.
- A test restore of `data.sql` into a fresh Postgres reproduces the app and
  `auth` data, and the runbook documents the full DB + Storage recovery.
