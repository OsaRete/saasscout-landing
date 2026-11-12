-- Additive private prototype method; existing family semantics and shared boundaries unchanged.
alter table public.validation_experiment_versions drop constraint validation_experiment_versions_family_check;
alter table public.validation_experiment_versions add constraint validation_experiment_versions_family_check check (family in ('customer_interview','survey','landing_waitlist','social_validation_post','interactive_prototype'));
-- Private, service-only prototype pages. No shared evidence or public database grants.
create table public.validation_prototype_pages (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null,
 experiment_version_id uuid not null, revision integer not null default 1 check(revision>0),
 removed boolean not null default false,
 content jsonb not null check(jsonb_typeof(content)='object' and octet_length(content::text)<=24000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(experiment_version_id), unique(id,owner_id),
 foreign key(experiment_version_id,owner_id) references public.validation_experiment_versions(id,owner_id) on delete restrict
);
create table public.validation_prototype_publications (
 id uuid primary key default gen_random_uuid(), page_id uuid not null, owner_id uuid not null,
 revision integer not null, content jsonb not null, token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 published_at timestamptz not null default now(), revoked_at timestamptz,
 unique(id,page_id,owner_id),
 foreign key(page_id,owner_id) references public.validation_prototype_pages(id,owner_id) on delete restrict
);
create unique index validation_prototype_active on public.validation_prototype_publications(page_id) where revoked_at is null;
create table public.validation_prototype_views (
 publication_id uuid not null, page_id uuid not null, owner_id uuid not null,
 screen text not null, target text,
 request_id uuid not null, visitor_hash text not null check(visitor_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(), primary key(publication_id,request_id),
 foreign key(publication_id,page_id,owner_id) references public.validation_prototype_publications(id,page_id,owner_id) on delete restrict
);
create table public.validation_prototype_submissions (
 id uuid primary key default gen_random_uuid(), publication_id uuid not null, page_id uuid not null, owner_id uuid not null,
 request_id uuid not null, payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=10000),

 visitor_hash text not null check(visitor_hash ~ '^[a-f0-9]{64}$'), consent_text text not null,
 submitted_at timestamptz not null default now(), unique(publication_id,visitor_hash), unique(publication_id,request_id),
 foreign key(publication_id,page_id,owner_id) references public.validation_prototype_publications(id,page_id,owner_id) on delete restrict
);
create table public.validation_prototype_rate_buckets (
 publication_id uuid not null references public.validation_prototype_publications(id),
 network_hash text not null, minute timestamptz not null, attempts integer not null,
 primary key(publication_id,network_hash,minute)
);
create index validation_prototype_views_page on public.validation_prototype_views(page_id,visitor_hash);
create index validation_prototype_submissions_page on public.validation_prototype_submissions(page_id,visitor_hash);

-- No browser grants, even owner reads: the authenticated dashboard uses scoped server commands.
do $$ declare t text; begin
 foreach t in array array['validation_prototype_pages','validation_prototype_publications','validation_prototype_views','validation_prototype_submissions','validation_prototype_rate_buckets'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
end $$;

create function public.validation_prototype_validate_content(c jsonb) returns void language plpgsql set search_path=public,pg_temp as $$
declare s jsonb; a jsonb; ids text[]; reached text[]; i integer;
begin
 if c is null or jsonb_typeof(c)<>'object' or octet_length(c::text)>24000
 or jsonb_typeof(c->'title') is distinct from 'string' or length(trim(c->>'title')) not between 1 and 180
 or jsonb_typeof(c->'purpose') is distinct from 'string' or length(trim(c->>'purpose')) not between 1 and 1000
 or c->>'consent' is distinct from 'I agree to share my anonymous navigation activity and feedback with the prototype creator for idea validation. I will not include personal or sensitive information.'
 or jsonb_typeof(c->'screens') is distinct from 'array' then raise exception 'invalid prototype'; end if;
 if jsonb_array_length(c->'screens') not between 2 and 6 then raise exception 'screen limit'; end if;
 select array_agg(x->>'id') into ids from jsonb_array_elements(c->'screens') x;
 if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'duplicate screen'; end if;
 for s in select * from jsonb_array_elements(c->'screens') loop
  if jsonb_typeof(s)<>'object' or coalesce(s->>'id','') !~ '^[A-Za-z0-9_-]{1,40}$'
  or s->>'layout' is null or s->>'layout' not in ('dashboard','detail','confirmation')
  or jsonb_typeof(s->'title') is distinct from 'string' or length(trim(s->>'title')) not between 1 and 120
  or jsonb_typeof(s->'description') is distinct from 'string' or length(trim(s->>'description')) not between 1 and 800
  or jsonb_typeof(s->'labels') is distinct from 'array' or jsonb_typeof(s->'actions') is distinct from 'array' then raise exception 'invalid screen'; end if;
  if jsonb_array_length(s->'labels')>4 or jsonb_array_length(s->'actions') not between 1 and 3 then raise exception 'screen limits'; end if;
  if exists(select 1 from jsonb_array_elements(s->'labels') l where jsonb_typeof(l)<>'string' or length(trim(l#>>'{}')) not between 1 and 120) then raise exception 'invalid labels'; end if;
  for a in select * from jsonb_array_elements(s->'actions') loop
   if jsonb_typeof(a)<>'object' or jsonb_typeof(a->'label') is distinct from 'string' or length(trim(a->>'label')) not between 1 and 60 or a->>'target' is null or not (a->>'target'=any(ids)) then raise exception 'invalid navigation'; end if;
  end loop;
 end loop;
 reached:=array[ids[1]];
 for i in 1..6 loop
  select array_agg(distinct id) into reached from (select unnest(reached) id union select nav->>'target' from jsonb_array_elements(c->'screens') scr cross join lateral jsonb_array_elements(scr->'actions') nav where scr->>'id'=any(reached)) q;
 end loop;
 if cardinality(reached)<>cardinality(ids) then raise exception 'unreachable screen'; end if;
end $$;
revoke all on function public.validation_prototype_validate_content(jsonb) from public,anon,authenticated;
grant execute on function public.validation_prototype_validate_content(jsonb) to service_role;

create function public.validation_prototype_owner(p_owner_id uuid,p_version_id uuid,p_action text,p_content jsonb default null,p_revision integer default null,p_token_hash text default null)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare v public.validation_experiment_versions; p public.validation_prototype_pages; result jsonb; pub uuid;
begin
 -- Same lock order for owner and public commands: version, page, publication.
 select * into v from public.validation_experiment_versions where id=p_version_id and owner_id=p_owner_id and family='interactive_prototype' for share;
 if not found then raise no_data_found; end if;
 if p_action is null or p_action not in ('read','save','publish','unpublish','remove') then raise exception 'invalid action'; end if;
 -- Serialize first creation and revisions without changing the immutable experiment.
 perform pg_advisory_xact_lock(hashtextextended(p_version_id::text,719));
 select * into p from public.validation_prototype_pages where experiment_version_id=v.id and owner_id=p_owner_id for update;
 if p_action='save' then
  if v.lifecycle not in ('draft','ready','running','paused') then raise exception 'terminal experiment'; end if;
  perform public.validation_prototype_validate_content(p_content);
  if p.id is null then
   if p_revision is distinct from 0 then raise exception 'revision conflict'; end if;
   insert into public.validation_prototype_pages(owner_id,experiment_version_id,content) values(p_owner_id,v.id,p_content) returning * into p;
  else
   if p_revision is distinct from p.revision then raise exception 'revision conflict'; end if;
   update public.validation_prototype_pages set content=p_content,removed=false,revision=revision+1,updated_at=now() where id=p.id returning * into p;
  end if;
 elsif p_action='remove' then
  if p.id is null then raise no_data_found; end if;
  if p_revision is distinct from p.revision then raise exception 'revision conflict'; end if;
  update public.validation_prototype_publications set revoked_at=clock_timestamp() where page_id=p.id and revoked_at is null;
  update public.validation_prototype_pages set removed=true,revision=revision+1,updated_at=now() where id=p.id returning * into p;
 elsif p_action in ('publish','unpublish') then
  if p.id is null then raise no_data_found; end if;
  if p_revision is distinct from p.revision then raise exception 'revision conflict'; end if;
  if p_action='publish' and (v.lifecycle<>'running' or p.removed or p_token_hash is null) then raise exception 'not running'; end if;
  update public.validation_prototype_publications set revoked_at=clock_timestamp() where page_id=p.id and revoked_at is null;
  if p_action='publish' then
   insert into public.validation_prototype_publications(page_id,owner_id,revision,content,token_hash) values(p.id,p_owner_id,p.revision,p.content,p_token_hash) returning id into pub;
  end if;
 end if;
 select jsonb_build_object('page',case when p.id is null then null else jsonb_build_object('id',p.id,'revision',p.revision,'content',p.content,'removed',p.removed) end,
 'publication',(select jsonb_build_object('id',id,'revision',revision,'publishedAt',published_at) from public.validation_prototype_publications where page_id=p.id and revoked_at is null),
 'metrics',jsonb_build_object('events',(select count(*) from public.validation_prototype_views where page_id=p.id),
 'browsers',(select count(distinct visitor_hash) from public.validation_prototype_views where page_id=p.id),
 'submissions',(select count(*) from public.validation_prototype_submissions where page_id=p.id),
 'screens',coalesce((select jsonb_agg(x) from (select screen,count(*) from public.validation_prototype_views where page_id=p.id and target is null group by screen) x),'[]'::jsonb),
 'outcomes',coalesce((select jsonb_agg(x) from (select payload->>'outcome' as outcome,count(*) from public.validation_prototype_submissions where page_id=p.id group by payload->>'outcome') x),'[]'::jsonb)),
 'submissions',coalesce((select jsonb_agg(x) from (select s.id,u.revision,s.payload->>'outcome' as outcome,s.payload->>'comment' as comment,s.submitted_at from public.validation_prototype_submissions s join public.validation_prototype_publications u on u.id=s.publication_id where s.page_id=p.id order by s.submitted_at desc limit 100) x),'[]'::jsonb)) into result;
 return result;
end $$;

create function public.validation_prototype_public(p_token_hash text,p_action text,p_visitor_hash text default null,p_request_id uuid default null,p_payload jsonb default null,p_consent boolean default false,p_network_hash text default null)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare pub public.validation_prototype_publications; p public.validation_prototype_pages; v public.validation_experiment_versions; n integer; prior jsonb; sc jsonb;
begin
 select * into pub from public.validation_prototype_publications where token_hash=p_token_hash;
 if not found then raise no_data_found; end if;
 select * into p from public.validation_prototype_pages where id=pub.page_id;
 select * into v from public.validation_experiment_versions where id=p.experiment_version_id and owner_id=p.owner_id and family='interactive_prototype' and lifecycle='running' for share;
 if not found then raise no_data_found; end if;
 perform 1 from public.validation_prototype_pages where id=p.id and not removed for share;
 if not found then raise no_data_found; end if;
 select * into pub from public.validation_prototype_publications where id=pub.id and revoked_at is null for share;
 if not found then raise no_data_found; end if;
 if p_action='resolve' then
  return jsonb_build_object('title',pub.content->'title','purpose',pub.content->'purpose','screens',pub.content->'screens','consent',pub.content->'consent');
 end if;
 if p_action is null or p_action not in ('event','submit') or p_visitor_hash is null or p_network_hash is null or p_network_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid request'; end if;
 -- Durable per-publication network budget, shared across application instances.
 insert into public.validation_prototype_rate_buckets values(pub.id,p_network_hash,date_trunc('minute',clock_timestamp()),1)
 on conflict(publication_id,network_hash,minute) do update set attempts=validation_prototype_rate_buckets.attempts+1 returning attempts into n;
 if n>60 then return jsonb_build_object('limited',true); end if;
 delete from public.validation_prototype_rate_buckets where publication_id=pub.id and minute<now()-interval '1 day';
 if p_consent is distinct from true or p_request_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or p_visitor_hash !~ '^[a-f0-9]{64}$' then raise exception 'explicit consent and bounded request required'; end if;
 if p_action='event' then
  select x into sc from jsonb_array_elements(pub.content->'screens') x where x->>'id'=p_payload->>'screen';
  if sc is null then raise exception 'unknown screen'; end if;
  if p_payload->>'target' is not null and not exists(select 1 from jsonb_array_elements(sc->'actions') a where a->>'target'=p_payload->>'target') then raise exception 'invalid navigation'; end if;
  -- Entry events are admitted only at the first screen. Subsequent views require an admitted edge.
  if p_payload->>'target' is null and p_payload->>'screen' <> pub.content->'screens'->0->>'id' and not exists(select 1 from public.validation_prototype_views where publication_id=pub.id and visitor_hash=p_visitor_hash and target=p_payload->>'screen') then raise exception 'navigation required'; end if;
  if p_payload->>'target' is not null and not exists(select 1 from public.validation_prototype_views where publication_id=pub.id and visitor_hash=p_visitor_hash and screen=p_payload->>'screen' and target is null) then raise exception 'screen view required'; end if;
  insert into public.validation_prototype_views(publication_id,page_id,owner_id,request_id,visitor_hash,screen,target) values(pub.id,p.id,p.owner_id,p_request_id,p_visitor_hash,p_payload->>'screen',p_payload->>'target') on conflict do nothing;
 else
  if jsonb_typeof(p_payload->'comment') is distinct from 'string' or length(trim(p_payload->>'comment')) not between 1 and 2000 or p_payload->>'outcome' is null or p_payload->>'outcome' not in ('yes','partly','no') or p_payload->>'consent' is distinct from 'I agree to share my anonymous navigation activity and feedback with the prototype creator for idea validation. I will not include personal or sensitive information.' or octet_length(p_payload::text)>10000 then raise exception 'invalid feedback'; end if;
  if not exists(select 1 from public.validation_prototype_views where publication_id=pub.id and visitor_hash=p_visitor_hash) then raise exception 'view required'; end if;
  select payload into prior from public.validation_prototype_submissions where publication_id=pub.id and visitor_hash=p_visitor_hash;
  if found and prior is distinct from p_payload then raise unique_violation using message='feedback conflict'; end if;
  insert into public.validation_prototype_submissions(publication_id,page_id,owner_id,request_id,visitor_hash,payload,consent_text)
  values(pub.id,p.id,p.owner_id,p_request_id,p_visitor_hash,p_payload,pub.content->>'consent') on conflict(publication_id,visitor_hash) do nothing;
  -- Concurrent retries must preserve the first payload too.
  select payload into prior from public.validation_prototype_submissions where publication_id=pub.id and visitor_hash=p_visitor_hash;
  if prior is distinct from p_payload then raise unique_violation using message='feedback conflict'; end if;
 end if;
 -- Stable response for identical retries; no participant or internal row IDs exposed.
 return jsonb_build_object('accepted',true);
end $$;
revoke all on function public.validation_prototype_owner(uuid,uuid,text,jsonb,integer,text) from public,anon,authenticated;
revoke all on function public.validation_prototype_public(text,text,text,uuid,jsonb,boolean,text) from public,anon,authenticated;
grant execute on function public.validation_prototype_owner(uuid,uuid,text,jsonb,integer,text) to service_role;
grant execute on function public.validation_prototype_public(text,text,text,uuid,jsonb,boolean,text) to service_role;

-- Preserve exact published content and attribution even for accidental service writes.
create function public.validation_prototype_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_table_name='validation_prototype_pages' then
  if new.id<>old.id or new.owner_id<>old.owner_id or new.experiment_version_id<>old.experiment_version_id or new.created_at<>old.created_at or new.revision<>old.revision+1 then raise exception 'immutable page identity'; end if;
 elsif tg_table_name='validation_prototype_publications' then
  if (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at') or old.revoked_at is not null or new.revoked_at is null then raise exception 'immutable publication'; end if;
 else raise exception 'immutable prototype observation';
 end if;
 return new;
end $$;
create trigger validation_prototype_page_guard before update on public.validation_prototype_pages for each row execute function public.validation_prototype_guard();
create trigger validation_prototype_publication_guard before update on public.validation_prototype_publications for each row execute function public.validation_prototype_guard();
create trigger validation_prototype_view_guard before update on public.validation_prototype_views for each row execute function public.validation_prototype_guard();
create trigger validation_prototype_submission_guard before update on public.validation_prototype_submissions for each row execute function public.validation_prototype_guard();
revoke all on function public.validation_prototype_guard() from public,anon,authenticated,service_role;
revoke delete on public.validation_prototype_pages,public.validation_prototype_publications,public.validation_prototype_views,public.validation_prototype_submissions from service_role;
revoke update on public.validation_prototype_views,public.validation_prototype_submissions from service_role;
