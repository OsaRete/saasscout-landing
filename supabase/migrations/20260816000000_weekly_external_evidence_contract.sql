-- W-B is additive: historical rows intentionally retain NULL provenance fields.
alter table public.weekly_sources
  add column if not exists evidence_id text,
  add column if not exists monitoring_topic_fingerprint text,
  add column if not exists source_provider text,
  add column if not exists canonical_url text,
  add column if not exists published_at timestamptz,
  add column if not exists collected_at timestamptz,
  add column if not exists first_seen_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists first_seen_period_start timestamptz,
  add column if not exists content_fingerprint text,
  add column if not exists freshness_class text,
  add column if not exists origin_class text;

alter table public.weekly_sources
  add constraint weekly_sources_freshness_class_check check (freshness_class is null or freshness_class in ('new','resurfaced','changed','unchanged','publication_unknown')),
  add constraint weekly_sources_origin_class_check check (origin_class is null or origin_class = 'raw_external'),
  add constraint weekly_sources_seen_order_check check (first_seen_at is null or last_seen_at is null or first_seen_at <= last_seen_at);

create unique index if not exists weekly_sources_run_evidence_id_uidx on public.weekly_sources(run_id, evidence_id) where evidence_id is not null;
create index if not exists weekly_sources_canonical_url_idx on public.weekly_sources(canonical_url) where canonical_url is not null;
create index if not exists weekly_sources_monitoring_topic_idx on public.weekly_sources(monitoring_topic_fingerprint) where monitoring_topic_fingerprint is not null;
create index if not exists weekly_sources_content_fingerprint_idx on public.weekly_sources(content_fingerprint) where content_fingerprint is not null;
create index if not exists weekly_sources_first_seen_idx on public.weekly_sources(first_seen_at desc) where first_seen_at is not null;
create index if not exists weekly_sources_last_seen_idx on public.weekly_sources(last_seen_at desc) where last_seen_at is not null;
create index if not exists weekly_sources_provider_type_idx on public.weekly_sources(source_provider, source_type) where source_provider is not null;

alter table public.weekly_sources enable row level security;
revoke all on table public.weekly_sources from public, anon, authenticated;
grant select, insert, update, delete on table public.weekly_sources to service_role;
