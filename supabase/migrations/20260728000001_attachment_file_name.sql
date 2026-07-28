-- Attachments: keep the original file name, and index the log link.
--
-- storage_path is sanitized down to an object-key-safe subset, so it cannot
-- round-trip a human-readable name like "Manual (2019) — LG.pdf". Documents
-- (unlike photos) are only distinguishable by name, so store it. Nullable:
-- rows written before this migration keep a null name and the UI falls back to
-- deriving one from storage_path.
alter table public.attachments add column file_name text;

-- The composite FK (maintenance_log_id, item_id) -> maintenance_logs (id,
-- item_id) gets no index on the referencing side, so every log delete
-- seq-scans attachments. Log-scoped attachments also query this column
-- directly, which makes it worth its own index.
create index attachments_log_idx on public.attachments (maintenance_log_id);
