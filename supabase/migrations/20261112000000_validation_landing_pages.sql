-- Private, service-only landing pages. No shared evidence or public database grants.
create table public.validation_landing_pages (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null,
 experiment_version_id uuid not null, revision integer not null default 1 check(revision>0),
 content jsonb not null check(jsonb_typeof(content)='object' and octet_length(content::text)<=12000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(experiment_version_id), unique(id,owner_id),
 foreign key(experiment_version_id,owner_id) references public.validation_experiment_versions(id,owner_id) on delete restrict
);
create table public.validation_landing_publications (
 id uuid primary key default gen_random_uuid(), page_id uuid not null, owner_id uuid not null,
 revision integer not null, content jsonb not null, token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 published_at timestamptz not null default now(), revoked_at timestamptz,
 unique(id,page_id,owner_id),
 foreign key(page_id,owner_id) references public.validation_landing_pages(id,owner_id) on delete restrict
);
create unique index validation_landing_active on public.validation_landing_publications(page_id) where revoked_at is null;
create table public.validation_landing_views (
 publication_id uuid not null, page_id uuid not null, owner_id uuid not null,
 request_id uuid not null, visitor_hash text not null check(visitor_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(), primary key(publication_id,request_id),
 foreign key(publication_id,page_id,owner_id) references public.validation_landing_publications(id,page_id,owner_id) on delete restrict
);
create table public.validation_landing_submissions (
 id uuid primary key default gen_random_uuid(), publication_id uuid not null, page_id uuid not null, owner_id uuid not null,
 email text not null check(length(email)<=254 and email=lower(trim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 visitor_hash text not null check(visitor_hash ~ '^[a-f0-9]{64}$'), consent_text text not null,
 submitted_at timestamptz not null default now(), unique(page_id,email),
 foreign key(publication_id,page_id,owner_id) references public.validation_landing_publications(id,page_id,owner_id) on delete restrict
);
create table public.validation_landing_rate_buckets (
 publication_id uuid not null references public.validation_landing_publications(id),
 network_hash text not null, minute timestamptz not null, attempts integer not null,
 primary key(publication_id,network_hash,minute)
);
create index validation_landing_views_page on public.validation_landing_views(page_id,visitor_hash);
create index validation_landing_submissions_page on public.validation_landing_submissions(page_id,visitor_hash);

-- No browser grants, even owner reads: the authenticated dashboard uses scoped server commands.
do $$ declare t text; begin
 foreach t in array array['validation_landing_pages','validation_landing_publications','validation_landing_views','validation_landing_submissions','validation_landing_rate_buckets'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
end $$;

create function public.validation_landing_owner(p_owner_id uuid,p_version_id uuid,p_action text,p_content jsonb default null,p_revision integer default null,p_token_hash text default null)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare v public.validation_experiment_versions; p public.validation_landing_pages; result jsonb; pub uuid;
begin
 -- Same lock order for owner and public commands: version, page, publication.
 select * into v from public.validation_experiment_versions where id=p_version_id and owner_id=p_owner_id and family='landing_waitlist' for share;
 if not found then raise no_data_found; end if;
 if p_action is null or p_action not in ('read','save','publish','unpublish','remove') then raise exception 'invalid action'; end if;
 -- Serialize first creation and revisions without changing the immutable experiment.
 perform pg_advisory_xact_lock(hashtextextended(p_version_id::text,719));
 select * into p from public.validation_landing_pages where experiment_version_id=v.id and owner_id=p_owner_id for update;
 if p_action='save' then
  if v.lifecycle not in ('draft','ready','running','paused') then raise exception 'terminal experiment'; end if;
  if p_content is null or jsonb_typeof(p_content)<>'object' or octet_length(p_content::text)>12000
   or not (p_content ?& array['template','headline','description','benefits','cta','visual','minimumVisitors','targetRate','consent'])
   or jsonb_typeof(p_content->'headline') is distinct from 'string'
   or jsonb_typeof(p_content->'description') is distinct from 'string'
   or jsonb_typeof(p_content->'cta') is distinct from 'string'
   or jsonb_typeof(p_content->'minimumVisitors') is distinct from 'number'
   or jsonb_typeof(p_content->'targetRate') is distinct from 'number'
   or p_content->>'visual' not in ('','✦','◎','↗')
   or exists(select 1 from jsonb_array_elements(p_content->'benefits') b where jsonb_typeof(b)<>'string' or length(b#>>'{}') not between 1 and 200)
   or p_content->>'template' not in ('spotlight','benefits','minimal')
   or length(coalesce(p_content->>'headline','')) not between 1 and 180
   or length(coalesce(p_content->>'description','')) not between 1 and 1500
   or length(coalesce(p_content->>'cta','')) not between 1 and 60
   or jsonb_typeof(p_content->'benefits') is distinct from 'array' or jsonb_array_length(p_content->'benefits')>5
   or (p_content->>'minimumVisitors')::integer not between 20 and 100000
   or (p_content->>'targetRate')::numeric not between 1 and 100
   or p_content->>'consent' is distinct from 'I agree to share my email with the page creator for updates about this idea. I can request removal at any time.'
   then raise exception 'invalid content'; end if;
  if p.id is null then
   if p_revision is distinct from 0 then raise exception 'revision conflict'; end if;
   insert into public.validation_landing_pages(owner_id,experiment_version_id,content) values(p_owner_id,v.id,p_content) returning * into p;
  else
   if p_revision is distinct from p.revision then raise exception 'revision conflict'; end if;
   update public.validation_landing_pages set content=p_content,revision=revision+1,updated_at=now() where id=p.id returning * into p;
  end if;
 elsif p_action='remove' then
  if p.id is null then raise no_data_found; end if;
  delete from public.validation_landing_submissions where id=(p_content->>'submissionId')::uuid and page_id=p.id and owner_id=p_owner_id;
 elsif p_action in ('publish','unpublish') then
  if p.id is null then raise no_data_found; end if;
  if p_revision is distinct from p.revision then raise exception 'revision conflict'; end if;
  if p_action='publish' and (v.lifecycle<>'running' or p_token_hash is null) then raise exception 'not running'; end if;
  update public.validation_landing_publications set revoked_at=clock_timestamp() where page_id=p.id and revoked_at is null;
  if p_action='publish' then
   insert into public.validation_landing_publications(page_id,owner_id,revision,content,token_hash) values(p.id,p_owner_id,p.revision,p.content,p_token_hash) returning id into pub;
  end if;
 end if;
 select jsonb_build_object('page',case when p.id is null then null else jsonb_build_object('id',p.id,'revision',p.revision,'content',p.content) end,
 'publication',(select jsonb_build_object('id',id,'revision',revision,'publishedAt',published_at) from public.validation_landing_publications where page_id=p.id and revoked_at is null),
 'metrics',jsonb_build_object('views',(select count(*) from public.validation_landing_views where page_id=p.id),
 'visitors',(select count(distinct visitor_hash) from public.validation_landing_views where page_id=p.id),
 'submissions',(select count(*) from public.validation_landing_submissions where page_id=p.id),
 'convertedVisitors',(select count(distinct s.visitor_hash) from public.validation_landing_submissions s where s.page_id=p.id and exists(select 1 from public.validation_landing_views w where w.page_id=p.id and w.visitor_hash=s.visitor_hash))),
 'submissions',coalesce((select jsonb_agg(x) from (select id,email,consent_text,submitted_at from public.validation_landing_submissions where page_id=p.id order by submitted_at desc limit 100) x),'[]'::jsonb)) into result;
 return result;
end $$;

create function public.validation_landing_public(p_token_hash text,p_action text,p_visitor_hash text default null,p_request_id uuid default null,p_email text default null,p_consent boolean default false,p_network_hash text default null)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare pub public.validation_landing_publications; p public.validation_landing_pages; v public.validation_experiment_versions; n integer;
begin
 select * into pub from public.validation_landing_publications where token_hash=p_token_hash;
 if not found then raise no_data_found; end if;
 select * into p from public.validation_landing_pages where id=pub.page_id;
 select * into v from public.validation_experiment_versions where id=p.experiment_version_id and owner_id=p.owner_id and family='landing_waitlist' and lifecycle='running' for share;
 if not found then raise no_data_found; end if;
 perform 1 from public.validation_landing_pages where id=p.id for share;
 select * into pub from public.validation_landing_publications where id=pub.id and revoked_at is null for share;
 if not found then raise no_data_found; end if;
 if p_action='resolve' then
  return jsonb_build_object('template',pub.content->'template','headline',pub.content->'headline','description',pub.content->'description','benefits',pub.content->'benefits','cta',pub.content->'cta','visual',pub.content->'visual','consent',pub.content->'consent');
 end if;
 if p_action is null or p_action not in ('view','submit') or p_visitor_hash is null or p_network_hash is null or p_network_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid request'; end if;
 -- Durable per-publication network budget, shared across application instances.
 insert into public.validation_landing_rate_buckets values(pub.id,p_network_hash,date_trunc('minute',clock_timestamp()),1)
 on conflict(publication_id,network_hash,minute) do update set attempts=validation_landing_rate_buckets.attempts+1 returning attempts into n;
 if n>20 then return jsonb_build_object('limited',true); end if;
 delete from public.validation_landing_rate_buckets where publication_id=pub.id and minute<now()-interval '1 day';
 if p_action='view' then
  if p_request_id is null then raise exception 'request id required'; end if;
  insert into public.validation_landing_views(publication_id,page_id,owner_id,request_id,visitor_hash) values(pub.id,p.id,p.owner_id,p_request_id,p_visitor_hash) on conflict do nothing;
 else
  if p_consent is distinct from true or p_email is null then raise exception 'explicit consent required'; end if;
  -- Only a browser with a recorded view can convert; contacts remain separately counted.
  if not exists(select 1 from public.validation_landing_views where page_id=p.id and visitor_hash=p_visitor_hash) then raise exception 'view required'; end if;
  insert into public.validation_landing_submissions(publication_id,page_id,owner_id,email,visitor_hash,consent_text)
  values(pub.id,p.id,p.owner_id,p_email,p_visitor_hash,pub.content->>'consent') on conflict(page_id,email) do nothing;
 end if;
 -- Same response for first submission and duplicate: never disclose email membership.
 return jsonb_build_object('accepted',true);
end $$;
revoke all on function public.validation_landing_owner(uuid,uuid,text,jsonb,integer,text) from public,anon,authenticated;
revoke all on function public.validation_landing_public(text,text,text,uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.validation_landing_owner(uuid,uuid,text,jsonb,integer,text) to service_role;
grant execute on function public.validation_landing_public(text,text,text,uuid,text,boolean,text) to service_role;

-- Preserve exact published content and attribution even for accidental service writes.
create function public.validation_landing_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_table_name='validation_landing_pages' then
  if new.id<>old.id or new.owner_id<>old.owner_id or new.experiment_version_id<>old.experiment_version_id or new.created_at<>old.created_at or new.revision<>old.revision+1 then raise exception 'immutable page identity'; end if;
 elsif tg_table_name='validation_landing_publications' then
  if (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at') or old.revoked_at is not null or new.revoked_at is null then raise exception 'immutable publication'; end if;
 else raise exception 'immutable landing observation';
 end if;
 return new;
end $$;
create trigger validation_landing_page_guard before update on public.validation_landing_pages for each row execute function public.validation_landing_guard();
create trigger validation_landing_publication_guard before update on public.validation_landing_publications for each row execute function public.validation_landing_guard();
create trigger validation_landing_view_guard before update on public.validation_landing_views for each row execute function public.validation_landing_guard();
create trigger validation_landing_submission_guard before update on public.validation_landing_submissions for each row execute function public.validation_landing_guard();
revoke all on function public.validation_landing_guard() from public,anon,authenticated,service_role;
revoke delete on public.validation_landing_pages,public.validation_landing_publications,public.validation_landing_views,public.validation_landing_submissions from service_role;
revoke update on public.validation_landing_views,public.validation_landing_submissions from service_role;

-- Owner-mediated privacy erasure remains available after collection ends.
grant delete on public.validation_landing_submissions to service_role;
