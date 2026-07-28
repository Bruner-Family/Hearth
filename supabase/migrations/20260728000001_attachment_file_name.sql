-- Attachments: keep the original file name, and index the log link.
--
-- storage_path is sanitized down to an object-key-safe subset, so it cannot
-- round-trip a human-readable name like "Manual (2019) — LG.pdf". Documents
-- (unlike photos) are only distinguishable by name, so store it. The column
-- remains nullable for compatibility with direct API clients.
alter table public.attachments add column file_name text;

-- Old object keys were `{household}/{item}/{timestamp}-{original name}`.
-- Backfill while that format is known. After random suffixes are introduced,
-- the original name cannot be reconstructed unambiguously from the key.
update public.attachments
set file_name = regexp_replace(
  regexp_replace(storage_path, '^.*/', ''),
  '^[0-9]+-',
  ''
)
where file_name is null;

-- The composite FK (maintenance_log_id, item_id) -> maintenance_logs (id,
-- item_id) gets no index on the referencing side, so every log delete
-- seq-scans attachments. Log-scoped attachments also query this column
-- directly, which makes it worth its own index.
create index attachments_log_idx on public.attachments (maintenance_log_id);
